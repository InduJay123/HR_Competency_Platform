"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useSession } from "./shell";
import { Button, Card, Feedback } from "./ui";
import { CompanyLogo } from "./company-logo";
type Company = {
  id: string;
  name: string;
  tagline: string;
  logo_url: string;
  slug: string;
  stewardship_code: string;
  mission: string;
  vision: string;
  nature: string;
  country: string;
  website: string;
  approved_at: string;
  created_at: string;
};
export function Settings() {
  const s = useSession(),
    [data, setData] = useState<Company | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [logo, setLogo] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    api<Company>(`companies/${s.company_id}/`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [s.company_id]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving.current || !data) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    let detailsSaved = false;
    try {
      const saved = await api<Company>(`companies/${data.id}/`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      detailsSaved = true;
      if (logo) {
        const upload = new FormData();
        upload.set("logo", logo);
        const result = await api<{ logo_url: string }>(
          `company-logo/${data.id}/`,
          {
            method: "POST",
            body: upload,
          },
        );
        setData({ ...saved, logo_url: result.logo_url });
        setLogo(null);
        if (fileInput.current) fileInput.current.value = "";
      } else {
        setData(saved);
      }
      window.dispatchEvent(new Event("bfl-profile-updated"));
      setSuccess(
        logo ? "Company details and logo saved." : "Company details saved.",
      );
    } catch (e) {
      setError(
        detailsSaved
          ? `Company details were saved, but the logo upload failed. Your selected file is retained; click Save company details to retry. ${(e as Error).message}`
          : (e as Error).message,
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Company settings</h1>
      <p className="subtitle">
        Your company identity appears across the workspace.
      </p>
      <Feedback error={error} success={success} />
      {data && (
        <Card title="Company profile">
          <p>
            <a href={`/auth/login?company=${encodeURIComponent(data.slug)}`}>
              Open your branded sign-in page →
            </a>
          </p>
          <form onSubmit={save}>
            <label>
              Company name
              <input name="name" defaultValue={data.name} required />
            </label>
            <label>
              Tagline
              <input name="tagline" defaultValue={data.tagline} />
            </label>
            <div className="form-two">
              <label>
                Company nature / industry
                <input
                  name="nature"
                  defaultValue={data.nature}
                  maxLength={180}
                />
              </label>
              <label>
                Country
                <input
                  name="country"
                  defaultValue={data.country}
                  maxLength={100}
                />
              </label>
            </div>
            <label>
              Vision
              <textarea
                name="vision"
                defaultValue={data.vision}
                maxLength={2000}
                placeholder="The future your company is working toward"
              />
            </label>
            <label>
              Mission
              <textarea
                name="mission"
                defaultValue={data.mission}
                maxLength={2000}
                placeholder="How your people create value every day"
              />
            </label>
            <label>
              Website
              <input name="website" type="url" defaultValue={data.website} />
            </label>
            <Button disabled={busy}>
              {busy ? "Saving…" : "Save company details"}
            </Button>
          </form>
          <hr />
          <p>
            <strong>{data.stewardship_code}</strong> · Platform joined{" "}
            {new Date(data.approved_at || data.created_at).toLocaleString()}
          </p>
          <p>
            Give this code to Steward Guys so they can request membership. Approve
            them under Join requests.
          </p>
          <label>
            Upload company logo
            <input
              ref={fileInput}
              type="file"
              disabled={busy}
              accept="image/png,image/jpeg"
              onChange={(e) => {
                setLogo(e.target.files?.[0] || null);
                setSuccess("");
                setError("");
              }}
            />
            <small>
              PNG or JPEG, maximum 2 MB
            </small>
          </label>
          {logo && <p>Selected logo: {logo.name}</p>}
          {data.logo_url && (
            <CompanyLogo
              src={data.logo_url}
              name={data.name}
              className="company-logo"
              width={36}
              height={36}
            />
          )}
        </Card>
      )}
    </>
  );
}
