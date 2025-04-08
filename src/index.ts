import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import drizzle from "../src/database";
import { marks, students, subjects, submissions, tasks, teachers, teacherSubjects, users } from "./database/schema";
import { cors } from 'hono/cors'
import { createId } from "@paralleldrive/cuid2";

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

  try {
    // Validate required fields
    if (!body.teacherSubjectId || !body.semester || !body.taskType || 
        !body.title || !body.dueDate || !body.totalMarks || !body.division) {
      return c.json({
        success: false,
        message: "Missing required fields"
      }, 400);
    }

    // Create the task
    const [newTask] = await db.insert(tasks).values({
      teacherSubjectId: body.teacherSubjectId,
      semester: body.semester,
      taskType: body.taskType,
      title: body.title,
      dueDate: new Date(body.dueDate),
      totalMarks: body.totalMarks,
    }).returning({ id: tasks.id });

    console.log({ id: newTask.id });

    // Find students in the class
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

    console.log(`Found ${studentsInClass.length} students in the class`);

    // Create submissions for each student - but in smaller batches
    const BATCH_SIZE = 20; // Smaller batch size to avoid SQLite variable limit
    let submissionsCreated = 0;

    // Process students in batches
    for (let i = 0; i < studentsInClass.length; i += BATCH_SIZE) {
      const batch = studentsInClass.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i/BATCH_SIZE + 1} with ${batch.length} students`);
      
      // Process each student individually to be extra safe
      for (const student of batch) {
        await db.insert(submissions).values({
          taskId: newTask.id,
          studentId: student.id,
          submissionFilePath: '',
          status: 'pending',
        });
        submissionsCreated++;
      }
    }

    return c.json({
      success: true,
      message: "Task added successfully and pending submissions created",
      task: newTask,
      submissionsCreated
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    return c.json({
      success: false,
      message: "Failed to create task",
      error: error.message
    }, 500);
  }
});

app.get("/teacher/dashboard", async (c) => {
  const db = drizzle(c.env.DB);
  const { semester, subjectId, division, taskId } = c.req.query();

  const dashboardData = await db
    .select({
      studentId: students.id,
      rollNumber: students.rollNumber,
      studentName: users.fullName,
      totalMarks: sql<number>`COALESCE(SUM(${marks.marksObtained}), 0)`,
    })
    .from(students)
    .innerJoin(users, eq(students.userId, users.id))
    .leftJoin(submissions, eq(submissions.studentId, students.id))
    .leftJoin(tasks, eq(submissions.taskId, tasks.id))
    .leftJoin(teacherSubjects, eq(tasks.teacherSubjectId, teacherSubjects.id))
    .leftJoin(marks, eq(marks.submissionId, submissions.id))
    .where(
      and(
        eq(students.currentSemester, parseInt(semester)),
        eq(students.division, division),
        eq(submissions.taskId, taskId),
        eq(teacherSubjects.subjectId, subjectId)
      ),
    )
    .groupBy(students.id, students.rollNumber, users.fullName)
    .orderBy(students.rollNumber);

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



// Bulk Student Registration from CSV
app.post("/auth/register-students-csv", async (c) => {
  const db = drizzle(c.env.DB);

  try {
    // Parse the multipart form data
    const formData = await c.req.formData();
    const csvFile = formData.get("file") as File;

    if (!csvFile) {
      return c.json({
        success: false,
        message: "CSV file is required"
      }, 400);
    }

    // Read and parse the CSV file
    const csvText = await csvFile.text();
    const rows = csvText.split("\n").filter(row => row.trim());

    // Assuming the first row is headers
    const headers = rows[0].split(",").map(header => header.trim());

    // Expected headers: pid, rollNumber, email, contactNumber, fullName
    const requiredHeaders = ["pid", "rollNumber", "email", "contactNumber", "fullName"];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return c.json({
        success: false,
        message: `CSV is missing required headers: ${missingHeaders.join(", ")}`
      }, 400);
    }

    // Process each row (skipping header)
    const results = {
      success: 0,
      failed: 0,
      errors: [] as { row: number; message: string }[]
    };

    for (let i = 1; i < rows.length; i++) {
      const rowData = rows[i].split(",").map(cell => cell.trim());

      // Create an object with the CSV data
      const studentData: Record<string, string> = {};
      headers.forEach((header, index) => {
        studentData[header] = rowData[index];
      });

      // Validate required fields
      let { pid, rollNumber, email, contactNumber, fullName } = studentData;

      // Convert email to lowercase
      email = email ? email.toLowerCase() : '';

      if (!pid || !rollNumber || !email || !contactNumber || !fullName) {
        results.failed++;
        results.errors.push({
          row: i,
          message: "Missing required fields"
        });
        continue;
      }

      try {
        // Check if email already exists
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          results.failed++;
          results.errors.push({
            row: i,
            message: `Email ${email} already registered`
          });
          continue;
        }

        // Check if PID already exists
        const existingPid = await db
          .select()
          .from(students)
          .where(eq(students.pid, pid))
          .limit(1);

        if (existingPid.length > 0) {
          results.failed++;
          results.errors.push({
            row: i,
            message: `PID ${pid} already registered`
          });
          continue;
        }



        // Generate password hash (first 8 digits of mobile number)
        const passwordHash = contactNumber.substring(0, 8);

        // Create user and student
        const userId = createId();
        const studentId = createId();

        // Insert user with lowercase email
        await db.insert(users).values({
          id: userId,
          email, // This is now lowercase
          passwordHash,
          fullName,
          contactNumber,
          role: "student",
          createdAt: new Date()
        });

        // Insert student with static values
        await db.insert(students).values({
          id: studentId,
          userId,
          rollNumber,
          pid,
          currentSemester: 6,
          currentYear: "TE",
          division: "B",
          academicYear: "2024-2025"
        });

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i,
          message: `Error: ${error.message}`
        });
      }
    }

    return c.json({
      success: true,
      message: "CSV processing completed",
      results
    });
  } catch (error: any) {
    console.error("CSV processing error:", error);
    return c.json({
      success: false,
      message: "An error occurred during CSV processing",
      error: error.message
    }, 500);
  }
});


// Create a teacher
app.post("/auth/register-teacher", async (c) => {
  const db = drizzle(c.env.DB);
  const { email, fullName, contactNumber, department, passwordHash } = await c.req.json();

  // Validate required fields
  if (!email || !fullName || !department) {
    return c.json({
      success: false,
      message: "Email, full name, and department are required"
    }, 400);
  }

  try {
    // Check if email already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({
        success: false,
        message: "Email already registered"
      }, 409);
    }

    // Create user and teacher with transaction
    const userId = createId();
    const teacherId = createId();

    // Insert user
    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash: passwordHash || contactNumber?.substring(0, 8) || "password123", // Default password
      fullName,
      contactNumber,
      role: "teacher",
      createdAt: new Date()
    });

    // Insert teacher
    await db.insert(teachers).values({
      id: teacherId,
      userId,
      department
    });

    return c.json({
      success: true,
      message: "Teacher registered successfully",
      data: {
        userId,
        teacherId,
        email,
        fullName,
        department
      }
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return c.json({
      success: false,
      message: "An error occurred during registration",
      error: error.message
    }, 500);
  }
});


// Create a subject
app.post("/subjects", async (c) => {
  const db = drizzle(c.env.DB);
  const { subjectCode, subjectName, semester, year } = await c.req.json();

  // Validate required fields
  if (!subjectCode || !subjectName || !semester || !year) {
    return c.json({
      success: false,
      message: "Subject code, name, semester, and year are required"
    }, 400);
  }

  try {
    // Check if subject already exists
    const existingSubject = await db
      .select()
      .from(subjects)
      .where(eq(subjects.subjectCode, subjectCode))
      .limit(1);

    if (existingSubject.length > 0) {
      return c.json({
        success: false,
        message: "Subject with this code already exists"
      }, 409);
    }

    // Create the subject
    const [newSubject] = await db.insert(subjects).values({
      subjectCode,
      subjectName,
      semester: typeof semester === 'string' ? parseInt(semester) : semester,
      year
    }).returning();

    return c.json({
      success: true,
      message: "Subject created successfully",
      data: newSubject
    });
  } catch (error: any) {
    console.error("Error creating subject:", error);
    return c.json({
      success: false,
      message: "Failed to create subject",
      error: error.message
    }, 500);
  }
});


// Create teacher-subject association
app.post("/teacher-subjects", async (c) => {
  const db = drizzle(c.env.DB);
  const { teacherId, subjectId, division, academicYear } = await c.req.json();

  // Validate required fields
  if (!teacherId || !subjectId || !division || !academicYear) {
    return c.json({
      success: false,
      message: "Teacher ID, subject ID, division, and academic year are required"
    }, 400);
  }

  try {
    // Check if teacher exists
    const teacher = await db
      .select()
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);

    if (!teacher.length) {
      return c.json({
        success: false,
        message: "Teacher not found"
      }, 404);
    }

    // Check if subject exists
    const subject = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);

    if (!subject.length) {
      return c.json({
        success: false,
        message: "Subject not found"
      }, 404);
    }

    // Check if association already exists
    const existingAssociation = await db
      .select()
      .from(teacherSubjects)
      .where(
        and(
          eq(teacherSubjects.teacherId, teacherId),
          eq(teacherSubjects.subjectId, subjectId),
          eq(teacherSubjects.division, division),
          eq(teacherSubjects.academicYear, academicYear)
        )
      )
      .limit(1);

    if (existingAssociation.length > 0) {
      return c.json({
        success: false,
        message: "This teacher-subject association already exists"
      }, 409);
    }

    // Create the association
    const [newAssociation] = await db.insert(teacherSubjects).values({
      teacherId,
      subjectId,
      division,
      academicYear
    }).returning();

    return c.json({
      success: true,
      message: "Teacher-subject association created successfully",
      data: newAssociation
    });
  } catch (error: any) {
    console.error("Error creating teacher-subject association:", error);
    return c.json({
      success: false,
      message: "Failed to create teacher-subject association",
      error: error.message
    }, 500);
  }
});



export default app;