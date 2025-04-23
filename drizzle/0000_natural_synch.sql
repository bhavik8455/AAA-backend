CREATE TABLE `marks` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`marks_obtained` real NOT NULL,
	`comments` text,
	`marked_by` text NOT NULL,
	`marked_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marks_submission_id_question_number_unique` ON `marks` (`submission_id`,`question_number`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`roll_number` text NOT NULL,
	`pid` text NOT NULL,
	`current_semester` integer NOT NULL,
	`current_year` text NOT NULL,
	`division` text NOT NULL,
	`academic_year` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_pid_unique` ON `students` (`pid`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_code` text NOT NULL,
	`subject_name` text NOT NULL,
	`semester` integer NOT NULL,
	`year` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_subject_code_unique` ON `subjects` (`subject_code`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`student_id` text NOT NULL,
	`submission_file_path` text NOT NULL,
	`submission_date` integer,
	`status` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_task_id_student_id_unique` ON `submissions` (`task_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_subject_id` text NOT NULL,
	`task_type` text NOT NULL,
	`title` text NOT NULL,
	`semester` integer NOT NULL,
	`due_date` integer NOT NULL,
	`total_marks` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`teacher_subject_id`) REFERENCES `teacher_subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teacher_subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`division` text NOT NULL,
	`academic_year` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_subjects_teacher_id_subject_id_division_academic_year_unique` ON `teacher_subjects` (`teacher_id`,`subject_id`,`division`,`academic_year`);--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`department` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`contact_number` text,
	`role` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);