import { APP } from "./client";
import { Icon } from "./icons";

/** The top of an admin page: the way back to Manage, the page title and one line about it. */
export function AdminHead({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="al-stack" style={{ gap: 8 }}>
      <p>
        <a className="al-text-btn" href={`${APP}/manage`}>
          <Icon name="back" />
          Back to Manage
        </a>
      </p>
      <h1 className="al-h1">{title}</h1>
      <p className="al-lead">{lead}</p>
    </div>
  );
}
