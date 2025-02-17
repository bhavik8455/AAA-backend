import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { insertSeedData } from "../data";
import drizzle from "../src/database";
import { marks, students, subjects, submissions, tasks, teachers, teacherSubjects, users } from "./database/schema";

const app = new Hono<{ Bindings: Env }>();

// Get Tasks for Student
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

// Add Task for Teacher
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

// Get Student Dashboard
app.get("/student/dashboard/:userId", async (c) => {
  const db = drizzle(c.env.DB);
  const userId = c.req.param("userId");

  const studentDetails = await db
    .select()
    .from(students)
    .innerJoin(users, eq(students.userId, users.id))
    .where(eq(students.userId, userId))
    .limit(1);

  if (!studentDetails.length) {
    return c.json({ message: "Student not found" }, 404);
  }

  return c.json(studentDetails[0]);
});

app.post("/student/submission/upload", async (c) => {
  const db = drizzle(c.env.DB);

  const uuid = crypto.randomUUID();
  const body = await c.req.parseBody();
  console.log(body);

  const r2 = await c.env.R2.put(uuid, body["file"]);

  await db.insert(submissions).values({
    taskId: body["taskId"].toString(),
    studentId: body["studentId"].toString(),
    submissionFilePath: uuid,
    status: "submitted",
  });

  return c.json(r2);
});

app.get("/student/file/:key", async (c) => {
  const r2 = await c.env.R2.get(c.req.param("key"));
  if (!r2) {
    return c.json({ message: "File not found" }, 404);
  }

  return new Response(r2.body, {
    headers: {
      "Content-Type": r2.httpMetadata?.contentType || "application/pdf",
    },
  });
});

// Get Tasks for Student based on the task status
app.get("/student/tasks/:status", async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.param("status");
  const studentId = c.req.query("studentId");

  if (!studentId) {
    return c.json({ success: false, message: "Student ID is required" }, 400);
  }

  const studentTasks = await db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
      totalMarks: tasks.totalMarks,
      submission: {
        status: submissions.status,
        submissionDate: submissions.submissionDate,
        filePath: submissions.submissionFilePath,
      },
      obtainedMarks: sql<number>`COALESCE(SUM(${marks.marksObtained}), 0)`,
    })
    .from(tasks)
    .leftJoin(submissions, eq(submissions.taskId, tasks.id))
    .leftJoin(marks, eq(marks.submissionId, submissions.id))
    .where(
      and(
        eq(submissions.studentId, studentId as string),
        eq(submissions.status, status),
      ),
    )
    .groupBy(
      tasks.id,
      tasks.title,
      tasks.taskType,
      tasks.dueDate,
      tasks.totalMarks,
      submissions.status,
      submissions.submissionDate,
      submissions.submissionFilePath,
    )
    .orderBy(tasks.dueDate);

  return c.json({
    success: true,
    data: studentTasks,
  });
});
// Generate Report for Teacher
app.get("/teacher/generate-report/:teacherSubjectId", async (c) => {
  const db = drizzle(c.env.DB);
  const teacherSubjectId = c.req.param("teacherSubjectId");

  const report = await db
    .select({
      studentName: users.fullName,
      rollNumber: students.rollNumber,
      taskTitle: tasks.title,
      taskType: tasks.taskType,
      submissionDate: submissions.submissionDate,
      questionNumber: marks.questionNumber,
      marksObtained: marks.marksObtained,
      totalMarks: tasks.totalMarks,
      comments: marks.comments,
    })
    .from(tasks)
    .leftJoin(submissions, eq(tasks.id, submissions.taskId))
    .leftJoin(marks, eq(submissions.id, marks.submissionId))
    .leftJoin(students, eq(submissions.studentId, students.id))
    .leftJoin(users, eq(students.userId, users.id))
    .where(eq(tasks.teacherSubjectId, teacherSubjectId))
    .orderBy(users.fullName, tasks.title, marks.questionNumber);

  return c.json(report);
});

// Get Students List for Teacher
app.get("/teacher/students-list", async (c) => {
  const db = drizzle(c.env.DB);
  const { semester, subjectId, division, taskId } = c.req.query();

  const studentsList = await db
    .select({
      rollNumber: students.rollNumber,
      studentName: users.fullName,
      submission: {
        status: submissions.status,
        submissionDate: submissions.submissionDate,
        filePath: submissions.submissionFilePath,
      },
      totalMarks: sql<number>`COALESCE(SUM(DISTINCT ${marks.marksObtained}), 0)`,
      comments: sql`GROUP_CONCAT(DISTINCT ${marks.comments})`,
    })
    .from(students)
    .innerJoin(users, eq(students.userId, users.id))
    .leftJoin(submissions, eq(submissions.studentId, students.id))
    .leftJoin(marks, eq(marks.submissionId, submissions.id))
    .where(
      and(
        eq(students.currentSemester, parseInt(semester)),
        eq(students.division, division),
        eq(submissions.taskId, taskId),
      ),
    )
    .groupBy(
      students.rollNumber,
      users.fullName,
      submissions.status,
      submissions.submissionDate,
      submissions.submissionFilePath,
    )
    .orderBy(students.rollNumber);

  return c.json({
    success: true,
    data: studentsList.map(student => ({
      ...student,
      totalMarks: Number(student.totalMarks),
    })),
  });
});

// Get Teacher Dashboard
app.get("/teacher/dashboard", async (c) => {
  const db = drizzle(c.env.DB);
  const { semester, subjectId, division, taskId } = c.req.query();

  const dashboardData = await db
    .select({
      studentName: users.fullName,
      totalMarks: sql<number>`COALESCE(SUM(DISTINCT ${marks.marksObtained}), 0)`,
    })
    .from(students)
    .innerJoin(users, eq(students.userId, users.id))
    .leftJoin(submissions, eq(submissions.studentId, students.id))
    .leftJoin(marks, eq(marks.submissionId, submissions.id))
    .where(
      and(
        eq(students.currentSemester, parseInt(semester)),
        eq(students.division, division),
        eq(submissions.taskId, taskId),
      ),
    )
    .groupBy(users.fullName)
    .orderBy(users.fullName);

  return c.json({
    success: true,
    data: dashboardData.map(student => ({
      ...student,
      totalMarks: Number(student.totalMarks),
    })),
  });
});
