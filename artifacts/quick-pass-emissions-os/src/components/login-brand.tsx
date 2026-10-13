import Image from "next/image";
import { CheckCheck } from "lucide-react";

export function LoginBrand() {
  return (
    <section className="login-brand qp-brand" aria-label="Quick Pass Emissions">
      <div className="login-wordmark">
        <span className="login-mark" aria-hidden="true">
          <CheckCheck size={27} strokeWidth={1.7} />
        </span>
        <span>
          Quick Pass<span className="login-wordmark-detail">Emissions</span>
        </span>
      </div>
      <div className="login-story qp-story">
        <p className="login-kicker">GEORGIA VEHICLE INSPECTIONS</p>
        <h1>
          Quick Pass
          <br />
          <span>Emissions</span>
        </h1>
        <p className="qp-greeting">How May I Help You?</p>
        <p className="login-story-copy">Friendly service. Clear results. Confidence on the road.</p>
      </div>
      <figure className="qp-photo">
        <Image
          src="/login-emissions-station.webp"
          alt="Quick Pass Emissions inspection and car wash station"
          width={1400}
          height={613}
          loading="eager"
        />
        <figcaption>
          <span className="qp-photo-mark" aria-hidden="true">
            <CheckCheck size={15} strokeWidth={1.8} />
          </span>
          A clear check. A confident drive.
        </figcaption>
      </figure>
      <footer className="login-brand-footer">
        <span>QUICK PASS EMISSIONS</span>
        <span>HERE TO HELP</span>
      </footer>
    </section>
  );
}
