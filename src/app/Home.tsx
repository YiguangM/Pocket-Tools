import { Link } from "react-router";
import { APP_NAME, useDocumentTitle } from "../shared/lib/useDocumentTitle";
import { IconArrowRight, IconLock, IconPlus } from "../shared/ui/icons";
import { Reveal } from "../shared/ui/Reveal";
import { tools } from "../tools/registry";

export function Home() {
  useDocumentTitle();
  return (
    <main className="wrap">
      <section className="hero">
        <Reveal as="h1" split="chars" stagger={0.04}>
          {APP_NAME}
        </Reveal>
        <Reveal as="p" className="tag" split="lines" delay={0.25}>
          Small, private tools that run in your browser. Your files stay in this tab and are never sent anywhere.
        </Reveal>
        <div className="proof">
          <span className="pill">
            <IconLock size={14} />0 bytes uploaded
          </span>
        </div>
      </section>

      <section className="home-tools" aria-labelledby="tools-h">
        <h2 className="section-label" id="tools-h">
          Tools
        </h2>
        <ul className="tool-cards">
          {tools.map(({ id, name, description, route, icon: Icon }) => (
            <li key={id}>
              <Link className="tool-card card" to={route}>
                <span className="tool-icon">
                  <Icon size={22} />
                </span>
                <span className="tool-name">{name}</span>
                <span className="tool-desc">{description}</span>
                <span className="tool-open">
                  Open <IconArrowRight size={14} />
                </span>
              </Link>
            </li>
          ))}
          <li>
            <div className="tool-card soon">
              <span className="tool-icon">
                <IconPlus size={22} />
              </span>
              <span className="tool-name">More tools coming</span>
              <span className="tool-desc">Each one follows the same rule: your files never leave this tab.</span>
            </div>
          </li>
        </ul>
      </section>

      <p className="site-foot">
        Everything runs in your browser. After your first visit the app also works with no connection. Nothing you add is uploaded,
        stored or tracked.
      </p>
    </main>
  );
}
