export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  lastEdited: string
  isArchived: boolean
  version: number
}
