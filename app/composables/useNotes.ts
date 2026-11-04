import type { NoteInput } from '#shared/schemas/note'
import type { Note } from '#shared/types/note'

export function useNotes() {
  const request = useRequestFetch()

  return {
    list: () => request<{ notes: Note[] }>('/api/notes'),
    read: (id: string) => request<Note>(`/api/notes/${encodeURIComponent(id)}`),
    create: (input: NoteInput) => $fetch<Note>('/api/notes', { method: 'POST', body: input }),
  }
}
