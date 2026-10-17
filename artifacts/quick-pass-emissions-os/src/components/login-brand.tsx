import Image from "next/image";

export function LoginBrand() {
  return (
    <section className="login-brand qp-brand" aria-label="Quick Pass Emissions">
      <Image
        className="login-logo"
        src="/images/quick-pass-logo.png"
        alt="Quick Pass Emissions"
        width={2172}
        height={724}
        priority
      />
      <div className="login-story qp-story">
        <p className="login-kicker">GEORGIA VEHICLE INSPECTIONS</p>
        <h1>
          Quick Pass
          <br />
          <span>Emissions</span>
        </h1>
        <p className="qp-greeting">
          Your emissions test.
          <br />
          Your tag renewal.
          <br />
          Your One Stop Shop.
        </p>
      </div>
      <figure className="qp-photo">
        <Image
          src="/login-option-1-building.webp"
          alt="The Wash Rack car wash building with blue signage"
          width={1240}
          height={580}
          loading="eager"
        />
      </figure>
    </section>
  );
}
