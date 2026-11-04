import type { NoteInput } from '#shared/schemas/note'
import type { Note } from '#shared/types/note'

export function useNotes() {
  const request = useRequestFetch()

  return {
    list: (archived = false) => request<{ notes: Note[] }>(archived ? '/api/notes?archived=true' : '/api/notes'),
    archive: (id: string, version: number) => $fetch<Note>(`/api/notes/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: { version },
    }),
    restore: (id: string, version: number) => $fetch<Note>(`/api/notes/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: { version },
    }),
    delete: (id: string, version: number) => $fetch<void>(`/api/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: { version },
    }),
    read: (id: string) => request<Note>(`/api/notes/${encodeURIComponent(id)}`),
    update: (id: string, input: NoteInput & { version: number }) => $fetch<Note>(`/api/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
    create: (input: NoteInput) => $fetch<Note>('/api/notes', { method: 'POST', body: input }),
  }
}
