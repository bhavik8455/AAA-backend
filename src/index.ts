import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { insertSeedData } from "../data";
import drizzle from "../src/database";
import { students, submissions, tasks } from "./database/schema";

const app = new Hono<{ Bindings: Env }>();

app.get("/student/getTasks", async (c) => {
  const db = drizzle(c.env.DB);

  const studentTasks = await db
    .select()
    .from(tasks)
    .innerJoin(students, eq(tasks.semester, students.currentSemester))
    .fullJoin(submissions, eq(tasks.id, submissions.taskId))
    .where(eq(students.id, "std_1"));

  return c.json(studentTasks);
});

app.post("/teacher/addTask", async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json();

  const newTask = await db.insert(tasks).values({
    teacherSubjectId: body.teacherSubjectId,
    semester: body.semester,
    taskType: body.taskType,
    title: body.title,
    dueDate: body.dueDate,
    totalMarks: body.totalMarks,
  });

  return c.json({ message: "Task added successfully", task: newTask });
});

export default app;
