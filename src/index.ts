import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import drizzle from "../src/database";
import { marks, students, subjects, submissions, tasks, teachers, teacherSubjects, users } from "./database/schema";
import { cors } from 'hono/cors'

const app = new Hono<{ Bindings: Env }>();

// Add CORD middleware
app.use('/*', cors({
  origin: ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true
}));

// STUDENT ROUTES
// -------------

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

// Get Tasks for Student based on status
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

// Upload Student Submissions
app.post("/student/submission/upload", async (c) => {
  const db = drizzle(c.env.DB);

  const uuid = crypto.randomUUID();
  const body = await c.req.parseBody();
  console.log(body);

  const r2 = await c.env.R2.put(uuid, body["file"]);

  await db.update(submissions)
    .set({
      submissionFilePath: uuid,
      status: "submitted",
      submissionDate: new Date()
    })
    .where(
      and(
        eq(submissions.taskId, body["taskId"].toString()),
        eq(submissions.studentId, body["studentId"].toString())
      )
    );

  return c.json(r2);
});

// Get Student Submissions
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



// Get Submission ID by File Path
app.get("/submission/id-by-filepath/:filePath", async (c) => {
  const db = drizzle(c.env.DB);
  const filePath = c.req.param("filePath");

  if (!filePath) {
    return c.json({
      success: false,
      message: "File path is required"
    }, 400);
  }

  try {
    const submission = await db
      .select({
        id: submissions.id,
        taskId: submissions.taskId,
        studentId: submissions.studentId,
        status: submissions.status,
        submissionDate: submissions.submissionDate
      })
      .from(submissions)
      .where(eq(submissions.submissionFilePath, filePath))
      .limit(1);

    if (!submission.length) {
      return c.json({
        success: false,
        message: "No submission found with the provided file path"
      }, 404);
    }

    return c.json({
      success: true,
      data: submission[0]
    });
  } catch (error: any) {
    console.error("Error fetching submission:", error);
    return c.json({
      success: false,
      message: "Failed to fetch submission",
      error: error.message
    }, 500);
  }
});



// TEACHER ROUTES
// -------------

// Add Task for Teacher
app.post("/teacher/addTask", async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json();

  const [newTask] = await db.insert(tasks).values({
    teacherSubjectId: body.teacherSubjectId,
    semester: body.semester,
    taskType: body.taskType,
    title: body.title,
    dueDate: new Date(body.dueDate),
    totalMarks: body.totalMarks,
  }).returning({ id: tasks.id });

  const studentsInClass = await db
    .select({
      id: students.id,
    })
    .from(students)
    .where(
      and(
        eq(students.currentSemester, body.semester),
        eq(students.division, body.division)
      )
    );

  const submissionValues = studentsInClass.map(student => ({
    taskId: newTask.id,
    studentId: student.id,
    submissionFilePath: '',
    status: 'pending',
  }));

  if (submissionValues.length > 0) {
    await db.insert(submissions).values(submissionValues);
  }

  return c.json({
    message: "Task added successfully and pending submissions created",
    task: newTask,
    submissionsCreated: submissionValues.length
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



// Get Teacher Tasks
app.get("/teacher/tasks", async (c) => {
  const db = drizzle(c.env.DB);
  const { semester, subjectId, division } = c.req.query();

  const tasksList = await db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      taskType: tasks.taskType,
      dueDate: tasks.dueDate,
      totalMarks: tasks.totalMarks,
      createdAt: tasks.createdAt
    })
    .from(tasks)
    .innerJoin(
      teacherSubjects,
      eq(tasks.teacherSubjectId, teacherSubjects.id)
    )
    .where(
      and(
        eq(tasks.semester, parseInt(semester)),
        eq(teacherSubjects.subjectId, subjectId),
        eq(teacherSubjects.division, division)
      )
    )
    .orderBy(tasks.createdAt);

  return c.json({
    success: true,
    data: tasksList
  });
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
      totalMarks: sql<number>`COALESCE(SUM(${marks.marksObtained}), 0)`,
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

app.get("/teacher/generate-report/:taskid", async (c) => {
  const db = drizzle(c.env.DB);
  const taskId = c.req.param("taskid");

  try {
    // First, check if the task exists
    const task = await db
      .select({
        id: tasks.id,
        teacherSubjectId: tasks.teacherSubjectId
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task.length) {
      return c.json({
        success: false,
        message: "Task not found"
      }, 404);
    }

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
      .where(eq(tasks.id, taskId)) // Filter by the specific task ID instead of teacherSubjectId
      .orderBy(users.fullName, tasks.title, marks.questionNumber);

    return c.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error("Error generating report:", error);
    return c.json({
      success: false,
      message: "Failed to generate report",
      error: error.message
    }, 500);
  }
});



app.post("/teacher/save-marks", async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json();
  const marksArray = body.marks;

  try {
    // Validate that all submission IDs exist
    for (const mark of marksArray) {
      // Check if submission exists
      const submission = await db.select()
        .from(submissions)
        .where(eq(submissions.id, mark.submissionId))
        .limit(1);

      if (!submission.length) {
        return c.json({
          success: false,
          message: `Submission with ID ${mark.submissionId} does not exist`
        }, 400);
      }

      // Check if teacher exists
      const teacher = await db.select()
        .from(teachers)
        .where(eq(teachers.id, mark.markedBy))
        .limit(1);

      if (!teacher.length) {
        return c.json({
          success: false,
          message: `Teacher with ID ${mark.markedBy} does not exist`
        }, 400);
      }
    }
    // First, delete any existing marks for this submission
    if (marksArray.length > 0) {
      const submissionId = marksArray[0].submissionId;
      await db.delete(marks).where(eq(marks.submissionId, submissionId));
    }


    // Insert new marks
    const insertedMarks = await db.insert(marks).values(marksArray).returning();
    return c.json({
      success: true,
      message: "Marks saved successfully",
      data: insertedMarks
    });
  } catch (error: any) {
    console.error("Error saving marks:", error);
    return c.json({
      success: false,
      message: "Failed to save marks",
      error: error.message
    }, 500);
  }
});



// Add this login route to your index.ts file
app.post("/auth/login", async (c) => {
  const db = drizzle(c.env.DB);
  const { email, password, role } = await c.req.json();

  // Validate required fields
  if (!email || !password || !role) {
    return c.json({
      success: false,
      message: "Email, password and role are required"
    }, 400);
  }

  try {
    // Find user by email
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!userResult.length) {
      return c.json({
        success: false,
        message: "Invalid credentials"
      }, 401);
    }

    const user = userResult[0];

    // Verify role matches
    if (user.role !== role) {
      return c.json({
        success: false,
        message: "Invalid role for this user"
      }, 403);
    }

    // Verify password
    const passwordMatch = (password === user.passwordHash);
    if (!passwordMatch) {
      return c.json({
        success: false,
        message: "Invalid credentials"
      }, 401);
    }

    // Get additional user details based on role
    let additionalDetails = null;
    let teacherSubjectsData = null;

    if (role === 'student') {
      const studentDetails = await db
        .select()
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);

      additionalDetails = studentDetails[0] || null;
    } else if (role === 'teacher') {
      const teacherDetails = await db
        .select()
        .from(teachers)
        .where(eq(teachers.userId, user.id))
        .limit(1);

      additionalDetails = teacherDetails[0] || null;

      // Fetch teacher's subjects if teacher was found
      if (additionalDetails) {
        teacherSubjectsData = await db
          .select({
            id: teacherSubjects.id,
            subjectId: teacherSubjects.subjectId,
            division: teacherSubjects.division,
            academicYear: teacherSubjects.academicYear,
            subjectName: subjects.subjectName,
            subjectCode: subjects.subjectCode,
            semester: subjects.semester,
            year: subjects.year
          })
          .from(teacherSubjects)
          .innerJoin(subjects, eq(teacherSubjects.subjectId, subjects.id))
          .where(eq(teacherSubjects.teacherId, additionalDetails.id));
      }
    }

    // Return user data without password hash
    const { passwordHash, ...userData } = user;

    return c.json({
      success: true,
      message: "Login successful",
      data: {
        user: userData,
        [role]: additionalDetails,
        teacherSubjects: role === 'teacher' ? teacherSubjectsData : null
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return c.json({
      success: false,
      message: "An error occurred during login",
      error: error.message
    }, 500);
  }
});

// Get Task IDs by Semester, Subject, and Division
app.get("/tasks/by-filters", async (c) => {
  const db = drizzle(c.env.DB);
  const { semester, subjectId, division } = c.req.query();

  // Validate required parameters
  if (!semester || !subjectId || !division) {
    return c.json({
      success: false,
      message: "Semester, subjectId, and division are required query parameters"
    }, 400);
  }

  try {
    const tasksList = await db
      .select({
        taskId: tasks.id,
        title: tasks.title,
        taskType: tasks.taskType,
        dueDate: tasks.dueDate,
        totalMarks: tasks.totalMarks,
        createdAt: tasks.createdAt
      })
      .from(tasks)
      .innerJoin(
        teacherSubjects,
        eq(tasks.teacherSubjectId, teacherSubjects.id)
      )
      .where(
        and(
          eq(tasks.semester, parseInt(semester)),
          eq(teacherSubjects.subjectId, subjectId),
          eq(teacherSubjects.division, division)
        )
      )
      .orderBy(tasks.createdAt);

    return c.json({
      success: true,
      data: tasksList
    });
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    return c.json({
      success: false,
      message: "Failed to fetch tasks",
      error: error.message
    }, 500);
  }
});

export default app;