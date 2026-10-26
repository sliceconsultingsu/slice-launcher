"use client";
import { useEffect, useState } from "react";
import { directorySchema, type Directory } from "../contracts";
import "./directory.css";

export function DirectoryView() {
  const [data, setData] = useState<Directory | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    void fetch("/api/apps/alumni/records", {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Directory unavailable");
        return directorySchema.parse(await response.json());
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className="alumni-workspace" aria-labelledby="alumni-title">
      <p className="alumni-eyebrow">Slice Consulting · Alumni</p>
      <h1 id="alumni-title">Find a connection. Build your next step.</h1>
      <p className="alumni-intro">
        Explore alumni experience and the goals students bring to the conversation.
      </p>
      <aside className="alumni-notice" aria-label="Sample data notice">
        <strong>Learning preview</strong> · These people and companies are fictional. Records are
        read-only. Matching, MCP tools and automatic refresh are not available yet.
      </aside>
      {error ? (
        <div role="alert">
          <p>We couldn’t load the directory. Check your access or try again.</p>
          <button className="alumni-button" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Loading sample records…</p>
      ) : (
        <>
          <section aria-labelledby="alumni-list-title">
            <div className="alumni-section-title">
              <h2 id="alumni-list-title">Alumni directory</h2>
              <span>{data.alumni.length} sample profiles</span>
            </div>
            {!data.alumni.length ? (
              <p>No alumni found.</p>
            ) : (
              <div className="alumni-grid">
                {data.alumni.map((person) => (
                  <article className="alumni-card" key={person.id}>
                    <span className="alumni-tag">{person.industry}</span>
                    <h3>{person.name}</h3>
                    <p>{person.role}</p>
                    <p className="alumni-muted">
                      {person.company} · Class of {person.graduationYear}
                    </p>
                    <h4>Can help with</h4>
                    <ul>
                      {person.expertise.map((topic) => (
                        <li key={topic}>{topic}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="student-list-title">
            <div className="alumni-section-title">
              <h2 id="student-list-title">Student goals</h2>
              <span>{data.students.length} sample profiles</span>
            </div>
            <div className="alumni-grid">
              {data.students.map((student) => (
                <article className="alumni-card" key={student.id}>
                  <h3>{student.name}</h3>
                  <p className="alumni-muted">
                    Class of {student.graduationYear} · {student.interests.join(", ")}
                  </p>
                  <p>{student.goals}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
