# Profile pictures

The existing `POST /api/v1/auth/profile/photo/` endpoint accepts multipart `photo`
(and the current employee profile `version` for membership accounts). It writes
only to the authenticated user's object. Platform admins and users without a
selected membership can upload without an employee profile/version.

Create a **private** Supabase Storage bucket named `profile-pictures` before using
uploads. Do not grant browser write permissions or make the bucket public. The
existing backend `SUPABASE_URL` and service-key settings used by company logos
are reused; no new frontend credentials are needed. Bucket creation is not run
at application startup. No live bucket inventory was available during this change;
the repository had no existing avatar bucket implementation.

Deploy the code and run `python manage.py migrate`. Then optionally run
`python manage.py migrate_profile_pictures` to transfer existing binary avatars.
This command performs real storage uploads: run it after configuring the bucket.
It is retryable, clears binary data only after successful upload, and preserves
already migrated images. If a user had different pictures in multiple memberships,
the most recently updated profile supplies the shared user avatar. Existing
external URL pictures remain readable and are replaced when a new image is uploaded;
the migration does not fetch arbitrary external URLs.

The canonical database fields are `User.profile_picture_storage_path` and
`profile_picture_version`. Legacy `EmployeeProfile.avatar_data` and `photo_url`
remain for compatibility; uploads clear them across the user's memberships and
never write new bytes there. No signed or Supabase public URLs are persisted.

Accepted inputs: JPG/JPEG, PNG, WEBP; non-empty, at most 5 MiB and 10 megapixels.
The extension, declared MIME type and Pillow-detected image format must agree.
Pillow decodes the image, rejects malformed/decompression-bomb images and retains
the previous 256×256, EXIF-aware square crop, encoding PNG. Each user therefore
always has exactly one predictable object: `users/<user-uuid>/avatar.png`.
The company-logo storage helper now supports opt-in upsert; logo and evidence
uploads retain their existing defaults.

Employee APIs return `/api/v1/employees/<profile-id>/photo/?v=<revision>` and retain
their existing tenant/role read restrictions. Session/platform data returns
`/api/v1/auth/profile/photo/?v=<revision>` for the authenticated user's own image.
Both routes proxy bytes through Django with `private, no-store` and `nosniff`.
The version increments on successful replacement; frontend account state and the
existing shell refresh event update displayed avatars without a page reload.

Storage upload failures leave database references, legacy pictures and revisions
unchanged. User-row locking serializes uploads. Storage and SQL are not a distributed
transaction: an ambiguous storage timeout or SQL failure after an accepted upsert
may leave the deterministic object newer than its recorded revision; retrying an
upload repairs it without generating orphan files.

Removing a picture clears its references and restores initials. The private,
unreferenced deterministic object is retained for replacement by a subsequent
upload (at most one object per user), matching the previous soft-remove behavior.
Legacy fields can be removed in a later migration after old data has been transferred.
