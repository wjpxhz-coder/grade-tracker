import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnvironment() {
  const values = new Map();

  for (const fileName of [".env", ".env.local"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), fileName), "utf8");
      for (const rawLine of content.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const separator = line.indexOf("=");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
        ) {
          value = value.slice(1, -1);
        }
        values.set(key, value);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  for (const [key, value] of values) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function parseArguments(aliases) {
  const args = process.argv.slice(2);
  if (args.length === 0) return { resetAlias: null };
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "用法:\n" +
        "  npm run bootstrap:users\n" +
        "  npm run bootstrap:users -- --reset-password <alias>\n\n" +
        "重置时，新口令从对应的 COUPLE_USER_N_PASSWORD 环境变量读取。",
    );
    process.exit(0);
  }
  if (args.length !== 2 || args[0] !== "--reset-password") {
    throw new Error("参数无效；使用 --help 查看用法");
  }

  const resetAlias = args[1].toLowerCase();
  if (!aliases.includes(resetAlias)) {
    throw new Error(`未知登录别名: ${args[1]}`);
  }
  return { resetAlias };
}

async function listUserByEmail(client, email) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  throw new Error("Auth 用户超过 10000 个，初始化脚本停止以避免错误匹配");
}

async function ensureAuthUser(client, config, resetAlias) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, login_email")
    .eq("login_alias", config.alias)
    .maybeSingle();
  if (profileError) {
    throw new Error(`读取 ${config.alias} 资料失败: ${profileError.message}`);
  }

  let user = null;
  if (profile) {
    const { data, error } = await client.auth.admin.getUserById(profile.id);
    if (error) throw error;
    user = data.user;
    if (!user) throw new Error(`资料 ${config.alias} 对应的 Auth 用户不存在`);
    if (user.email?.toLowerCase() !== config.email) {
      throw new Error(
        `${config.alias} 已绑定其他邮箱；为避免误改账号，脚本已停止`,
      );
    }
  } else {
    user = await listUserByEmail(client, config.email);
  }

  let created = false;
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: {
        display_name: config.nickname,
        login_alias: config.alias,
      },
    });
    if (error) throw error;
    user = data.user;
    created = true;
  } else {
    const attributes = {
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        display_name: config.nickname,
        login_alias: config.alias,
      },
    };
    if (resetAlias === config.alias) attributes.password = config.password;

    const { data, error } = await client.auth.admin.updateUserById(
      user.id,
      attributes,
    );
    if (error) throw error;
    user = data.user;
  }

  const { error: upsertError } = await client.from("profiles").upsert(
    {
      id: user.id,
      display_name: config.nickname,
      login_alias: config.alias,
      login_email: config.email,
      color_key: config.color,
    },
    { onConflict: "id" },
  );
  if (upsertError) throw upsertError;

  return { user, created, passwordReset: !created && resetAlias === config.alias };
}

async function ensureSharedSpace(client, users) {
  const ids = users.map(({ user }) => user.id);
  const { data: memberships, error: membershipError } = await client
    .from("space_members")
    .select("space_id, user_id, member_number")
    .in("user_id", ids);
  if (membershipError) throw membershipError;

  const spaces = [...new Set(memberships.map((item) => item.space_id))];
  if (spaces.length > 1) {
    throw new Error("两个账号已属于不同空间；请先在后台人工核对，脚本不会自动合并数据");
  }

  let spaceId = spaces[0] ?? null;
  if (!spaceId) {
    const { data, error } = await client
      .from("spaces")
      .insert({ name: "我们的成绩手账", created_by: ids[0] })
      .select("id")
      .single();
    if (error) throw error;
    spaceId = data.id;
  }

  const { data: allMembers, error: allMembersError } = await client
    .from("space_members")
    .select("user_id, member_number")
    .eq("space_id", spaceId);
  if (allMembersError) throw allMembersError;

  const unexpected = allMembers.filter((member) => !ids.includes(member.user_id));
  if (unexpected.length > 0) {
    throw new Error("目标空间已有其他成员；脚本不会替换或删除现有成员");
  }

  const occupiedNumbers = new Set(allMembers.map((member) => member.member_number));
  for (const [index, id] of ids.entries()) {
    if (allMembers.some((member) => member.user_id === id)) continue;

    let memberNumber = index + 1;
    if (occupiedNumbers.has(memberNumber)) {
      memberNumber = [1, 2].find((number) => !occupiedNumbers.has(number));
    }
    if (!memberNumber) throw new Error("共享空间已经达到两人上限");

    const { error } = await client.from("space_members").insert({
      space_id: spaceId,
      user_id: id,
      member_number: memberNumber,
    });
    if (error) throw error;
    occupiedNumbers.add(memberNumber);
  }

  return spaceId;
}

async function main() {
  loadLocalEnvironment();

  if (process.argv.slice(2).some((argument) => ["--help", "-h"].includes(argument))) {
    parseArguments([]);
  }

  const configs = [1, 2].map((number) => ({
    email: required(`COUPLE_USER_${number}_EMAIL`).toLowerCase(),
    password: required(`COUPLE_USER_${number}_PASSWORD`),
    nickname: required(`COUPLE_USER_${number}_NICKNAME`),
    alias: required(`COUPLE_USER_${number}_ALIAS`).toLowerCase(),
    color: number === 1 ? "sage" : "peach",
  }));

  for (const config of configs) {
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(config.alias)) {
      throw new Error(`登录别名 ${config.alias} 格式无效`);
    }
    if (config.password.length < 16) {
      throw new Error(`${config.alias} 的口令必须至少 16 个字符`);
    }
    if (config.nickname.length > 40) {
      throw new Error(`${config.alias} 的昵称不能超过 40 个字符`);
    }
  }
  if (configs[0].email === configs[1].email) throw new Error("两个邮箱必须不同");
  if (configs[0].alias === configs[1].alias) throw new Error("两个登录别名必须不同");

  const { resetAlias } = parseArguments(configs.map(({ alias }) => alias));
  const supabaseUrl = required("SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = [];
  for (const config of configs) {
    users.push(await ensureAuthUser(client, config, resetAlias));
  }
  const spaceId = await ensureSharedSpace(client, users);

  console.log("双账号初始化完成：");
  for (const [index, result] of users.entries()) {
    const state = result.created
      ? "新建账号"
      : result.passwordReset
        ? "已重置口令"
        : "账号已存在，未修改口令";
    console.log(`- ${configs[index].alias} (${configs[index].nickname}): ${state}`);
  }
  console.log(`- 共享空间 ID: ${spaceId}`);
  console.log("脚本未输出任何口令或 service-role key。请立即清理当前终端中的敏感环境变量。");
}

main().catch((error) => {
  console.error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
