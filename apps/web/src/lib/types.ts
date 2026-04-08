// Dashboard component types — extracted from mockData.ts

export type Assignment = {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  type: 'Project' | 'Homework' | 'Lab' | 'Quiz' | 'Exam';
  dueDate: Date;
  submitted: boolean;
  overdue: boolean;
  daysUntil: number;
  score: number | null;
  maxScore: number | null;
  status: 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded';
  source: 'canvas' | 'gradescope' | 'both';
};

export type Announcement = {
  id: string;
  courseCode: string;
  title: string;
  source: 'Canvas' | 'Ed' | 'Email';
  timeAgo: string;
  unread: boolean;
};

export type EdAnnouncement = {
  id: string;
  courseCode: string;
  title: string;
  timeAgo: string;
  isPinned: boolean;
  linkedAssignment: string | null;
  unread: boolean;
};

export type OfficeHours = {
  id: string;
  staffName: string;
  role: 'TA' | 'Professor' | 'GSI';
  courseCode: string;
  timeRange: string;
  location: string;
  isZoom: boolean;
  isNow: boolean;
};

export type Exam = {
  id: string;
  name: string;
  courseCode: string;
  date: Date;
  time: string;
  location: string;
  daysUntil: number;
};

export type Staff = {
  id: string;
  name: string;
  role: string;
  email: string;
};

export type GradeItem = {
  name: string;
  score: number;
  max: number;
  status: 'graded' | 'pending' | 'submitted';
};

export type CourseGrade = {
  courseCode: string;
  courseName: string;
  letterGrade: string;
  percentage: number;
  breakdown: GradeItem[];
};

export type EdQuestion = {
  id: string;
  courseId: string;
  courseCode: string;
  title: string;
  contentPreview: string;
  answerCount: number;
  voteCount: number;
  isAnswered: boolean;
  isPinned: boolean;
  linkedAssignment: string | null;
  url: string;
  createdAt: string;
};

export type ClassEvent = {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  type: 'Lecture' | 'Discussion' | 'Lab';
  dayOfWeek: number;
  officialStartTime: string;
  officialEndTime: string;
  berkeleyStartTime: string;
  berkeleyEndTime: string;
  room: string;
  building: string;
};
