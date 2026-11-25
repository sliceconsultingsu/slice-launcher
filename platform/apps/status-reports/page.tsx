import { CopyPrompt } from "./copy-prompt";
import {
  CONSULTANT_ASK,
  DRAFTING_RULES,
  EXAMPLE,
  GATHER,
  PROMPT,
  TEMPLATE,
  type Workstream,
} from "./content";

const cell = "border-b border-(--line) py-2 pr-3 text-left align-top";

function WorkstreamBlock({ workstream }: { workstream: Workstream }) {
  return (
    <>
      <h4 className="mt-4 font-semibold">{workstream.heading}</h4>
      <p className="mb-1 font-semibold">{workstream.completedLabel}</p>
      <ul>
        {workstream.completed.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mb-1 font-semibold">{workstream.plannedLabel}</p>
      <ul>
        {workstream.planned.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

function ScheduleTable({ rows }: { rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            {TEMPLATE.scheduleColumns.map((column) => (
              <th key={column} scope="col" className={`${cell} font-semibold`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((value, index) => (
                <td key={index} className={cell}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The whole app: fixed instructions, a prompt to copy, the template and a fictional example. */
export function StatusReportsPage() {
  return (
    <section className="guide-content">
      <h1>Status reports</h1>
      <p className="notice" role="status">
        <strong>Work in progress.</strong> This app is still being tested with project managers and
        its wording may change.
      </p>
      <p>
        Turn your consultants&apos; updates into a draft client status report with your own AI
        assistant. This page stores nothing and sends nothing. You review the draft, paste it into
        the Slides template and send the PDF yourself.
      </p>

      <h2 id="sensitive">Before you start: sensitive and NDA projects</h2>
      <div className="notice">
        <p>
          <strong>
            If your project is under an NDA, or is on the sensitive-project list, do not use this
            prompt.
          </strong>{" "}
          Never paste that project&apos;s material into an AI assistant. Compile the report by hand
          or in a tool Slice has approved for it. The VP of Operations keeps the list; ask them if
          you are unsure.
        </p>
        <p>
          For every other project, remember that anything you paste into your AI assistant leaves
          Slice for that provider. Paste only what the report needs.
        </p>
      </div>

      <h2>1. Gather your notes</h2>
      <ul>
        {GATHER.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>Ask each consultant for a few lines in this shape: {CONSULTANT_ASK}</p>

      <h2>2. Copy the prompt</h2>
      <p>
        Replace the words in square brackets, say whether the project is under an NDA, and paste
        your notes at the end.
      </p>
      <CopyPrompt prompt={PROMPT} />

      <h2>3. Review the draft</h2>
      <p>
        You are responsible for every word the client sees. Check the draft against these rules.
      </p>
      <ul>
        {DRAFTING_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <p>
        Answer every item under &quot;Questions for the PM&quot; before you send. The assistant
        lists gaps there instead of guessing.
      </p>

      <h2>4. Paste into the template and send</h2>
      <p>
        Paste each part into the status report Slides template, save it as a PDF named{" "}
        <code>{TEMPLATE.fileName}</code>, and email it to the client with the VP of Operations and
        the VP of Client Relations on CC.
      </p>

      <h2>Report format</h2>
      <h3>Slide 1: title</h3>
      <ul>
        {TEMPLATE.title.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3>Slides 2 and on: completed and planned work</h3>
      <pre>
        <code>{TEMPLATE.workstream.join("\n")}</code>
      </pre>
      <p>{TEMPLATE.workstreamNote}</p>
      <h3>Last slide: upcoming schedule</h3>
      <ScheduleTable rows={[["[Event]", "[Date or dates]", "[Anything the client should know]"]]} />

      <h2>Example report</h2>
      <p>
        Every name, the client and the dates below are invented. File name:{" "}
        <code>{EXAMPLE.fileName}</code>
      </p>
      <h3>Slide 1</h3>
      <ul>
        {EXAMPLE.title.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3>Slide 2</h3>
      {EXAMPLE.workstreams.map((workstream) => (
        <WorkstreamBlock key={workstream.heading} workstream={workstream} />
      ))}
      <h3>Slide 3: upcoming schedule</h3>
      <ScheduleTable rows={EXAMPLE.schedule} />

      <h2>Need help?</h2>
      <p>
        Ask the VP of Operations about report content, deadlines or whether a project is sensitive.
        Ask the people who run this app if you cannot open it. The full guide is on the app&apos;s
        Details page in the App Launcher.
      </p>
    </section>
  );
}
