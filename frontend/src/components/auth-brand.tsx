import { Brand } from "./brand";
import Image from "next/image";

export function AuthHero({ recovery = false }: { recovery?: boolean }) {
  return (
    <section className="live-auth-hero">
      <div className="hero-brand">
        <Brand />
      </div>
      <div className="auth-hero-copy">
        <p className="eyebrow">THE STEWARDSHIP MINDSET</p>
        <h1>
          {recovery ? (
            "Your next chapter is waiting."
          ) : (
            <>
              Contribute to purpose.
              <br />
              Leave a lasting impact.
            </>
          )}
        </h1>
        <p>
          Recognise your contribution. Build your capabilities. Create something
          that lasts.
        </p>
      </div>
      <div className="auth-pillars">
        {[
          "Character",
          "Contribution",
          "Capability",
          "Context",
          "Continuity",
        ].map((p, i) => (
          <div key={p}>
            <span>0{i + 1}</span>
            <strong>{p}</strong>
          </div>
        ))}
      </div>
      <small>Beyond the Finish Line · Performance with purpose</small>
    </section>
  );
}

export function RecoveryMark() {
  return (
    <div className="recovery-mark" aria-hidden="true">
      <Image
        src="/auth-lock.svg"
        width={17.6625}
        height={22.1625}
        alt=""
        unoptimized
      />
    </div>
  );
}

export function EmailIcon() {
  return (
    <Image
      className="email-icon"
      src="/auth-email.svg"
      width={16.4167}
      height={13.0833}
      alt=""
      unoptimized
    />
  );
}
