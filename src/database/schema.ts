import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
// Users table
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  contactNumber: text("contact_number"),
  role: text("role").notNull(), // 'student' | 'teacher' | 'admin'
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Students table
export const students = sqliteTable("students", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  rollNumber: text("roll_number").notNull(),
  pid: text("pid").notNull().unique(),
  currentSemester: integer("current_semester").notNull(),
  currentYear: text("current_year").notNull(), // 'FE' | 'SE' | 'TE' | 'BE'
  division: text("division").notNull(),
  academicYear: text("academic_year").notNull(), // Format: 2024-2025
});

// Teachers table
export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  department: text("department").notNull(),
});

// Subjects table
export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  subjectCode: text("subject_code").notNull().unique(),
  subjectName: text("subject_name").notNull(),
  semester: integer("semester").notNull(),
  year: text("year").notNull(), // 'FE' | 'SE' | 'TE' | 'BE'
});

// Teacher-Subject assignments
export const teacherSubjects = sqliteTable("teacher_subjects", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subjects.id),
  division: text("division").notNull(),
  academicYear: text("academic_year").notNull(),
}, (table) => ({
  uniqueIdx: unique().on(
    table.teacherId,
    table.subjectId,
    table.division,
    table.academicYear,
  ),
}));

// Tasks/Assignments table with semester
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  teacherSubjectId: text("teacher_subject_id")
    .notNull()
    .references(() => teacherSubjects.id),
  taskType: text("task_type").notNull(), // 'ISE1' | 'ISE2' | 'MSE'
  title: text("title").notNull(),
  semester: integer("semester").notNull(), // Added semester column
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  totalMarks: integer("total_marks").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Student submissions
export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  submissionFilePath: text("submission_file_path").notNull(),
  submissionDate: integer("submission_date", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  status: text("status").notNull(), // 'pending' | 'submitted' | 'graded'
}, (table) => ({
  uniqueIdx: unique().on(table.taskId, table.studentId),
}));

// Marks distribution
export const marks = sqliteTable("marks", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id),
  questionNumber: integer("question_number").notNull(),
  marksObtained: real("marks_obtained").notNull(),
  comments: text("comments"),
  markedBy: text("marked_by")
    .notNull()
    .references(() => teachers.id),
  markedAt: integer("marked_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  uniqueIdx: unique().on(table.submissionId, table.questionNumber),
}));

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  student: one(students, {
    fields: [users.id],
    references: [students.userId],
  }),
  teacher: one(teachers, {
    fields: [users.id],
    references: [teachers.userId],
  }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, {
    fields: [students.userId],
    references: [users.id],
  }),
  submissions: many(submissions),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, {
    fields: [teachers.userId],
    references: [users.id],
  }),
  teacherSubjects: many(teacherSubjects),
  marksGiven: many(marks),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  teacherSubjects: many(teacherSubjects),
}));

export const teacherSubjectsRelations = relations(teacherSubjects, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [teacherSubjects.teacherId],
    references: [teachers.id],
  }),
  subject: one(subjects, {
    fields: [teacherSubjects.subjectId],
    references: [subjects.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  teacherSubject: one(teacherSubjects, {
    fields: [tasks.teacherSubjectId],
    references: [teacherSubjects.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  task: one(tasks, {
    fields: [submissions.taskId],
    references: [tasks.id],
  }),
  student: one(students, {
    fields: [submissions.studentId],
    references: [students.id],
  }),
  marks: many(marks),
}));

export const marksRelations = relations(marks, ({ one }) => ({
  submission: one(submissions, {
    fields: [marks.submissionId],
    references: [submissions.id],
  }),
  markedByTeacher: one(teachers, {
    fields: [marks.markedBy],
    references: [teachers.id],
  }),
}));
