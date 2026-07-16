import { useQuery } from '@tanstack/react-query'
import { listExams, listSubjectScores } from '../lib/api'

export function useExamData(studentId?: string) {
  const examsQuery = useQuery({
    queryKey: ['exams', studentId ?? 'all', 'active'],
    queryFn: () => listExams({ studentId }),
  })
  const examIds = examsQuery.data?.map((exam) => exam.id) ?? []
  const subjectScoresQuery = useQuery({
    queryKey: ['subject-scores', ...examIds],
    queryFn: () => listSubjectScores(examIds),
    enabled: examsQuery.isSuccess,
  })

  return {
    exams: examsQuery.data ?? [],
    subjectScores: subjectScoresQuery.data ?? [],
    isLoading: examsQuery.isLoading || subjectScoresQuery.isLoading,
    error: examsQuery.error ?? subjectScoresQuery.error,
    refetch: async () => {
      await examsQuery.refetch()
      await subjectScoresQuery.refetch()
    },
  }
}
