import type { NoteInput } from '#shared/schemas/note'
import type { Note } from '#shared/types/note'

export function useNotes() {
  const request = useDemoRequest()

  return {
    list: (archived = false, q = '', tag = '') => request<{ notes: Note[] }>('/api/notes', {
      query: {
        ...(archived
          ? { archived: 'true' }
          : {}),
        ...(q
          ? { q }
          : {}),
        ...(tag
          ? { tag }
          : {}),
      },
    }),
    tags: () => request<{ tags: string[] }>('/api/notes/tags'),
    archive: (id: string, version: number) => request<Note>(`/api/notes/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: { version },
    }),
    restore: (id: string, version: number) => request<Note>(`/api/notes/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: { version },
    }),
    delete: (id: string, version: number) => request<void>(`/api/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: { version },
    }),
    read: (id: string) => request<Note>(`/api/notes/${encodeURIComponent(id)}`),
    update: (id: string, input: NoteInput & { version: number }) => request<Note>(`/api/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
    create: (input: NoteInput) => request<Note>('/api/notes', { method: 'POST', body: input }),
  }
}
