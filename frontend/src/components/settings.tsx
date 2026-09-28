"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useSession } from "./shell";
import { Button, Card, Feedback } from "./ui";
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
    [success, setSuccess] = useState("");
  useEffect(() => {
    api<Company>(`companies/${s.company_id}/`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [s.company_id]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api(`companies/${s.company_id}/`, {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      window.dispatchEvent(new Event("bfl-profile-updated"));
      setSuccess("Company details saved.");
    } catch (e) {
      setError((e as Error).message);
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
            <label>
              Company logo URL
              <input name="logo_url" type="url" defaultValue={data.logo_url} />
            </label>
            <Button>Save company details</Button>
          </form>
          <hr />
          <p>
            <strong>{data.stewardship_code}</strong> · Platform joined{" "}
            {new Date(data.approved_at || data.created_at).toLocaleString()}
          </p>
          <p>
            Give this code to employees so they can request membership. Approve
            them under Join requests.
          </p>
          <label>
            Upload company logo
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const f = new FormData();
                f.set("logo", file);
                try {
                  const result = await api<{ logo_url: string }>(
                    `company-logo/${data.id}/`,
                    { method: "POST", body: f },
                  );
                  setData({ ...data, logo_url: result.logo_url });
                  setSuccess(
                    "Company logo uploaded. It appears in your workspace and branded sign-in page.",
                  );
                  window.dispatchEvent(new Event("bfl-profile-updated"));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            <small>
              Transparent PNG recommended. PNG or JPEG, maximum 2 MB.
            </small>
          </label>
        </Card>
      )}
    </>
  );
}
