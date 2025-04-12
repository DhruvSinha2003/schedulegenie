
export interface Task {
    taskId: string;
    content: string;
    day: string;
    time: string;
    isCompleted: boolean;
    notes: string | null;
  }