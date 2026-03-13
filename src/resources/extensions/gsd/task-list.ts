import { readFileSync } from 'node:fs';

export interface TaskItem {
  title: string;
  done: boolean;
}

const CHECKBOX_RE = /^\s*-\s*\[([ xX])\]\s+(.+)$/;

export function loadTaskList(path: string): TaskItem[] {
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }

  const items: TaskItem[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(CHECKBOX_RE);
    if (m) {
      items.push({ title: m[2].trim(), done: m[1] !== ' ' });
    }
  }
  return items;
}
