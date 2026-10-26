import { directorySchema } from "./contracts";

/** Entirely invented records. Never replace these with real alumni or student data. */
export const sampleDirectory = directorySchema.parse({
  dataset: "synthetic",
  alumni: [
    {
      id: "alum-001",
      name: "Alex Example",
      graduationYear: 2021,
      company: "Northstar Example Co.",
      role: "Strategy consultant",
      industry: "Consulting",
      expertise: ["Case interviews", "Strategy"],
      lastVerifiedAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "alum-002",
      name: "Jordan Sample",
      graduationYear: 2020,
      company: "Cedar Example Labs",
      role: "Product analyst",
      industry: "Technology",
      expertise: ["Product analytics", "Data analysis"],
      lastVerifiedAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "alum-003",
      name: "Taylor Demo",
      graduationYear: 2022,
      company: "Harbor Example Group",
      role: "Financial analyst",
      industry: "Finance",
      expertise: ["Financial modeling", "Interview preparation"],
      lastVerifiedAt: "2026-10-01T00:00:00Z",
    },
  ],
  students: [
    {
      id: "student-001",
      name: "Casey Example",
      graduationYear: 2027,
      interests: ["Consulting", "Strategy"],
      goals: "Practice a consulting case interview.",
    },
    {
      id: "student-002",
      name: "Morgan Sample",
      graduationYear: 2028,
      interests: ["Technology", "Data analysis"],
      goals: "Learn what a product analyst does.",
    },
  ],
});
