"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { PersonalProfile } from "@/lib/types";
import { dateTime } from "./access";
import { Card, Button, Feedback, Loading } from "./ui";

export function Account() {
  const [profile, setProfile] = useState<PersonalProfile | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Profile");
  useEffect(() => {
    api<PersonalProfile>("auth/profile/")
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);
  function updated(p: PersonalProfile) {
    setProfile(p);
    window.dispatchEvent(new Event("bfl-profile-updated"));
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      updated(
        await api<PersonalProfile>("auth/profile/", {
          method: "PATCH",
          body: JSON.stringify({ ...data, version: profile.version }),
        }),
      );
      setSuccess("Your profile has been saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !profile) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData();
    form.set("photo", file);
    form.set("version", String(profile.version));
    try {
      updated(
        await api<PersonalProfile>("auth/profile/photo/", {
          method: "POST",
          body: form,
        }),
      );
      setSuccess("Profile photo updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preference(changes: object) {
    if (!profile) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      updated(
        await api<PersonalProfile>("auth/profile/", {
          method: "PATCH",
          body: JSON.stringify({ ...changes, version: profile.version }),
        }),
      );
      setSuccess("Preference saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My Account Settings</h1>
          <p className="profile-code">
            {profile?.stewardship_code} · Platform joined{" "}
            {dateTime(profile?.platform_joined_at)}
          </p>
          <p className="subtitle">
            Manage your profile, security and notification preferences.
          </p>
        </div>
      </div>
      <nav className="account-tabs" aria-label="Account sections">
        {["Profile", "Security", "Notifications"].map((x) => (
          <button
            key={x}
            aria-current={tab === x ? "page" : undefined}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      <Feedback error={error} success={success} />
      {!profile ? (
        <Loading />
      ) : tab === "Profile" ? (
        <div className="profile-columns">
          <Card title="Personal details">
            <p className="muted">
              Keep your personal identity clear and up to date.
            </p>
            <div className="profile-identity">
              {profile.photo_url ? (
                <Image
                  className="profile-photo"
                  unoptimized
                  width={64}
                  height={64}
                  src={profile.photo_url}
                  alt="Your profile"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="profile-initials">
                  {profile.first_name[0]}
                  {profile.last_name[0]}
                </span>
              )}
              <div>
                <h2>
                  {profile.first_name} {profile.last_name}
                </h2>
                <p>
                  {profile.designation || "Add your designation"}
                  {profile.joined_on
                    ? ` · Since ${profile.joined_on.slice(0, 4)}`
                    : ""}
                </p>
              </div>
              <label className="button neutral photo-upload">
                Change photo
                <input
                  aria-label="Change profile photo"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="photo-hint">
              <small>
                PNG or JPEG, up to 2 MB. Photos are cropped to a square.
              </small>
              {profile.photo_url && (
                <button
                  disabled={busy}
                  onClick={() => preference({ remove_photo: true })}
                >
                  Remove photo
                </button>
              )}
            </div>
            <form onSubmit={save} className="profile-form">
              <div className="form-grid">
                <label>
                  First name
                  <input
                    name="first_name"
                    defaultValue={profile.first_name}
                    required
                    maxLength={150}
                    autoComplete="given-name"
                  />
                </label>
                <label>
                  Last name
                  <input
                    name="last_name"
                    defaultValue={profile.last_name}
                    required
                    maxLength={150}
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={profile.phone}
                    maxLength={32}
                    autoComplete="tel"
                    placeholder="+94 ..."
                  />
                </label>
                <label>
                  Contact email
                  <input
                    name="contact_email"
                    type="email"
                    defaultValue={profile.contact_email}
                    maxLength={254}
                    autoComplete="email"
                    placeholder="Your preferred contact email"
                  />
                </label>
              </div>
              <label>
                Sign-in email
                <input value={profile.email} readOnly />
                <small>
                  Contact HR to change your sign-in identity. Contact email does
                  not change your login.
                </small>
              </label>
              <div className="form-grid">
                <label>
                  Designation
                  <input
                    name="designation"
                    defaultValue={profile.designation}
                    maxLength={160}
                    autoComplete="organization-title"
                  />
                </label>
                <label>
                  Employment company
                  <input
                    name="employment_company"
                    defaultValue={profile.employment_company}
                    placeholder={profile.company_name}
                    maxLength={180}
                    autoComplete="organization"
                  />
                  <small>
                    Your professional profile; this does not change workspace
                    access.
                  </small>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Location
                  <input
                    name="location"
                    defaultValue={profile.location}
                    maxLength={120}
                    placeholder="City or work location"
                  />
                </label>
                <label>
                  Skills and interests
                  <input
                    name="skills"
                    defaultValue={profile.skills}
                    maxLength={500}
                    placeholder="Leadership, operations, mentoring"
                  />
                </label>
              </div>
              <label>
                About me
                <textarea
                  name="bio"
                  defaultValue={profile.bio}
                  maxLength={2000}
                  rows={4}
                  placeholder="Your experience, contribution and development interests"
                />
              </label>
              <div className="actions">
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </form>
          </Card>
          <aside className="profile-summary">
            <Card title="Your organisation">
              <dl>
                <dt>Workspace company</dt>
                <dd>{profile.company_name}</dd>
                <dt>Department</dt>
                <dd>{profile.department_name || "Not assigned"}</dd>
                <dt>Reporting manager</dt>
                <dd>{profile.manager_name || "Not assigned"}</dd>
                <dt>Joining date</dt>
                <dd>{profile.joined_on || "Not recorded"}</dd>
              </dl>
              <small>
                HR manages your reporting line, joining date and access
                responsibilities.
              </small>
            </Card>
            <Card title="Security and notifications">
              <p>
                Manage account access and daily reminders from the tabs above.
              </p>
              <Button variant="neutral" onClick={() => setTab("Security")}>
                Manage security
              </Button>
            </Card>
          </aside>
        </div>
      ) : tab === "Security" ? (
        <Card title="Account security">
          <p>
            You sign in as <strong>{profile.email}</strong>.
          </p>
          <p>
            Request a secure reset link to change your password. Contact HR if
            you cannot access your sign-in email.
          </p>
          <Link className="button primary" href="/auth/forgot-password">
            Reset password
          </Link>
          <p>
            Use Sign out in the sidebar when you finish on a shared computer.
          </p>
        </Card>
      ) : (
        <Card title="Daily reminders">
          <label className="check">
            <input
              type="checkbox"
              checked={profile.notification_digest}
              disabled={busy}
              onChange={(e) =>
                preference({ notification_digest: e.target.checked })
              }
            />
            Remind me about overdue reviews and development commitments
          </label>
          <p>
            Action and workflow notifications remain available in My Actions.
          </p>
          <Link href="/employee/notifications">Open My Actions →</Link>
        </Card>
      )}
    </>
  );
}
