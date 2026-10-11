import { ArrowUpRight, CheckCheck, Droplets, ScanLine, TicketCheck } from "lucide-react";

function ServiceIllustration() {
  return (
    <svg className="login-service-art" viewBox="0 0 620 280" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="qp-bay"
          x1="90"
          y1="60"
          x2="420"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#315e65" />
          <stop offset="1" stopColor="#173b46" />
        </linearGradient>
        <linearGradient
          id="qp-car"
          x1="170"
          y1="152"
          x2="340"
          y2="218"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f6f1df" />
          <stop offset="1" stopColor="#b4c8c3" />
        </linearGradient>
        <linearGradient
          id="qp-water"
          x1="440"
          y1="110"
          x2="440"
          y2="210"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8fe1c7" stopOpacity=".65" />
          <stop offset="1" stopColor="#8fe1c7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="481" cy="64" r="34" fill="#f0dba3" fillOpacity=".9" />
      <path d="M22 222H600M48 238H570" stroke="#72a4a2" strokeOpacity=".2" />
      <path
        d="M94 220V86L167 53H496L543 86V220"
        fill="url(#qp-bay)"
        stroke="#6b9b9c"
        strokeOpacity=".35"
      />
      <path d="M94 86H543L496 53H167L94 86Z" fill="#497e7e" />
      <path d="M86 85H550" stroke="#a6e3ca" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M121 220V111H320V220M349 220V111H514V220"
        fill="#102d38"
        stroke="#63928f"
        strokeOpacity=".45"
      />
      <path d="M133 122H308M361 122H502" stroke="#9adbbf" strokeOpacity=".7" strokeWidth="3" />
      <text
        x="221"
        y="103"
        textAnchor="middle"
        fill="#cce5d8"
        fontSize="10"
        fontFamily="Arial, sans-serif"
        letterSpacing="3"
      >
        EMISSIONS
      </text>
      <text
        x="432"
        y="103"
        textAnchor="middle"
        fill="#cce5d8"
        fontSize="10"
        fontFamily="Arial, sans-serif"
        letterSpacing="3"
      >
        CARWASH
      </text>
      <path
        d="M368 136V208M386 136V213M405 136V205M423 136V213M442 136V204M461 136V213M480 136V208M499 136V204"
        stroke="url(#qp-water)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="240" cy="224" rx="111" ry="10" fill="#071e29" fillOpacity=".5" />
      <path
        d="M150 190L163 158C167 148 175 143 188 142H265C277 142 285 148 292 157L314 189L332 196V215H140V199L150 190Z"
        fill="url(#qp-car)"
      />
      <path
        d="M169 181L180 155H213V181H169ZM220 155H263C270 155 274 158 278 164L289 181H220V155Z"
        fill="#1d414b"
      />
      <path d="M164 186H295M216 148V189" stroke="#98b4b1" strokeWidth="2" />
      <path d="M147 197H167M307 197H326" stroke="#f6e6b9" strokeWidth="5" strokeLinecap="round" />
      <rect x="230" y="190" width="12" height="3" rx="1.5" fill="#6e8d91" />
      <circle cx="179" cy="215" r="17" fill="#0c2430" />
      <circle cx="179" cy="215" r="9" fill="#8da9ad" />
      <circle cx="295" cy="215" r="17" fill="#0c2430" />
      <circle cx="295" cy="215" r="9" fill="#8da9ad" />
      <path
        d="M55 218V179M55 197C36 193 32 179 37 168C54 174 59 184 55 197ZM55 187C74 184 80 170 75 159C58 165 51 176 55 187Z"
        stroke="#88bea7"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M44 218H66L63 235H47L44 218Z" fill="#5a8e83" />
      <path
        d="M564 154V170M556 162H572M397 34V44M392 39H402"
        stroke="#b9e6d4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="541" cy="133" r="3" fill="#9bd6c0" />
      <path
        d="M176 257H222M265 257H311M354 257H400M443 257H489"
        stroke="#739591"
        strokeOpacity=".45"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginBrand() {
  return (
    <section className="login-brand" aria-label="Quick Pass Business OS">
      <div className="login-brand-top">
        <div className="login-wordmark">
          <span className="login-mark">
            <CheckCheck size={27} strokeWidth={2.5} />
          </span>
          <span>
            QUICK PASS<small>BUSINESS OS</small>
          </span>
        </div>
        <span className="login-workspace-label">
          YOUR BUSINESS, TOGETHER <ArrowUpRight size={13} />
        </span>
      </div>
      <div className="login-story">
        <p className="login-kicker">
          <span /> A LITTLE CLARITY GOES A LONG WAY
        </p>
        <h1>
          A fresh start.
          <br />
          <em>A smoother day.</em>
        </h1>
        <p className="login-story-copy">
          From the first test to the final rinse.
          <br />
          Your people, your bays, your business — in sync.
        </p>
        <div className="login-scene">
          <ServiceIllustration />
        </div>
        <div className="login-scene-caption">
          <span>A clear view. A confident start.</span>
          <span className="login-caption-line" />
        </div>
      </div>
      <footer className="login-brand-footer">
        <div className="login-services">
          <span>
            <ScanLine size={15} /> Emissions
          </span>
          <span>
            <TicketCheck size={15} /> Tag renewal
          </span>
          <span>
            <Droplets size={15} /> Carwash
          </span>
        </div>
        <p>Built around the way you work.</p>
      </footer>
    </section>
  );
}
