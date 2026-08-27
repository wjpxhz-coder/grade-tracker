import os
from PIL import Image, ImageDraw

def draw_sprout_icon(size: int, is_maskable: bool = False) -> Image.Image:
    # Render at 4x scale for super sampling anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    bg_color = (63, 110, 90, 255)       # #3f6e5a
    stroke_color = (255, 254, 251, 255)  # #fffefb

    if is_maskable:
        # Maskable icons fill entire canvas with background color
        draw.rectangle([0, 0, canvas_size, canvas_size], fill=bg_color)
        # Emblem is centered within safe zone (e.g. 60% of size)
        emblem_box = (int(canvas_size * 0.2), int(canvas_size * 0.2), int(canvas_size * 0.8), int(canvas_size * 0.8))
        emblem_w = emblem_box[2] - emblem_box[0]
        emblem_h = emblem_box[3] - emblem_box[1]
        ox = emblem_box[0]
        oy = emblem_box[1]
    else:
        # Regular icon: rounded rectangle
        corner_radius = int(canvas_size * (18 / 64))
        draw.rounded_rectangle([0, 0, canvas_size - 1, canvas_size - 1], radius=corner_radius, fill=bg_color)
        ox = 0
        oy = 0
        emblem_w = canvas_size
        emblem_h = canvas_size

    # The SVG coordinate space is 64x64
    def sx(x):
        return ox + (x / 64.0) * emblem_w

    def sy(y):
        return oy + (y / 64.0) * emblem_h

    stroke_width = max(1, int(4 * (emblem_w / 64.0)))

    # Draw stem
    draw.line([(sx(32), sy(48)), (sx(32), sy(29))], fill=stroke_color, width=stroke_width)

    # Bezier curve sampler
    def bezier_curve(p0, p1, p2, p3, steps=100):
        points = []
        for i in range(steps + 1):
            t = i / steps
            u = 1 - t
            x = (u**3)*p0[0] + 3*(u**2)*t*p1[0] + 3*u*(t**2)*p2[0] + (t**3)*p3[0]
            y = (u**3)*p0[1] + 3*(u**2)*t*p1[1] + 3*u*(t**2)*p2[1] + (t**3)*p3[1]
            points.append((x, y))
        return points

    # Left leaf
    left_arc1 = bezier_curve(
        (sx(32), sy(34)),
        (sx(32 - 8), sy(34 + 0)),
        (sx(32 - 13), sy(34 - 5)),
        (sx(32 - 14), sy(34 - 13))
    )
    left_arc2 = bezier_curve(
        (sx(18), sy(21)),
        (sx(18 + 8), sy(21 + 0)),
        (sx(18 + 13), sy(21 + 4)),
        (sx(18 + 14), sy(21 + 11))
    )

    # Right leaf
    right_arc1 = bezier_curve(
        (sx(32), sy(34)),
        (sx(32 + 8), sy(34 + 0)),
        (sx(32 + 13), sy(34 - 5)),
        (sx(32 + 14), sy(34 - 13))
    )
    right_arc2 = bezier_curve(
        (sx(46), sy(21)),
        (sx(46 - 8), sy(21 + 0)),
        (sx(46 - 13), sy(21 + 4)),
        (sx(46 - 14), sy(21 + 11))
    )

    draw.line(left_arc1, fill=stroke_color, width=stroke_width, joint="curve")
    draw.line(left_arc2, fill=stroke_color, width=stroke_width, joint="curve")
    draw.line(right_arc1, fill=stroke_color, width=stroke_width, joint="curve")
    draw.line(right_arc2, fill=stroke_color, width=stroke_width, joint="curve")

    # Round caps for line endings
    r_cap = stroke_width / 2.0
    for pt in [(sx(32), sy(48)), (sx(32), sy(29)), (sx(18), sy(21)), (sx(46), sy(21))]:
        draw.ellipse([pt[0] - r_cap, pt[1] - r_cap, pt[0] + r_cap, pt[1] + r_cap], fill=stroke_color)

    # Downsample
    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    public_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    
    # 1. pwa-192x192.png
    icon_192 = draw_sprout_icon(192)
    icon_192.save(os.path.join(public_dir, "pwa-192x192.png"), "PNG")
    
    # 2. pwa-512x512.png
    icon_512 = draw_sprout_icon(512)
    icon_512.save(os.path.join(public_dir, "pwa-512x512.png"), "PNG")
    
    # 3. maskable-icon-512x512.png
    maskable_512 = draw_sprout_icon(512, is_maskable=True)
    maskable_512.save(os.path.join(public_dir, "maskable-icon-512x512.png"), "PNG")
    
    # 4. apple-touch-icon.png (180x180)
    apple_icon = draw_sprout_icon(180)
    apple_icon.save(os.path.join(public_dir, "apple-touch-icon.png"), "PNG")

    print("All PWA icons generated successfully.")

if __name__ == "__main__":
    main()
