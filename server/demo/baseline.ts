import type { TransactionSql } from 'postgres'

export const demoSamples = [
  [
    {
      title: 'A weekend outdoors',
      content: 'Pack a water bottle and explore a nearby trail.\n\nLeave time to enjoy the view.',
      tags: ['Outdoors', 'Weekend'],
    },
    {
      title: 'Reading list',
      content: 'Collect a few books to read this season.\nAdd your own recommendations.',
      tags: ['Books'],
    },
    {
      title: 'Small daily habits',
      content: 'Take a short walk.\nWrite down one thing you learned.',
      tags: ['Habits'],
    },
  ],
  [
    {
      title: 'Story ideas',
      content: 'A visitor finds a handwritten map inside a library book.\n\nWhat happens next?',
      tags: ['Writing', 'Ideas'],
    },
    {
      title: 'Kitchen experiments',
      content: 'Try roasting seasonal vegetables with herbs.\nKeep notes on your favourite combinations.',
      tags: ['Cooking'],
    },
    {
      title: 'Project sketchbook',
      content: 'Choose one small idea.\nBuild a first version, then reflect on what worked.',
      tags: ['Projects', 'Ideas'],
    },
  ],
]

export async function insertDemoNotes(sql: TransactionSql, ownerId: string, index: number) {
  for (const note of demoSamples[index]!) {
    await sql`INSERT INTO notes (owner_id, title, content, tags) VALUES (${ownerId}, ${note.title}, ${note.content}, ${note.tags})`
  }
}
