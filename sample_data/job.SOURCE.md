# Sample job description — source and anonymisation notes

`job.txt` is a REAL public job posting, anonymised. It is the sample
job description the matcher scores the sample resume against.

- **Source:** NHS Jobs advert for a Junior/Intermediate Data Analyst,
  posted 27 November 2025, reference B0480-25-0028.
  URL: https://www.jobs.nhs.uk/candidate/jobadvert/B0480-25-0028
- **Retrieved:** 20 November 2026.
- **Anonymised:** the employer's name, office address, reference number
  and recruitment email address were removed and replaced with generic
  wording. No person's name appears in the original advert and none was
  added.
- **Trimmed:** the long boilerplate sections of the original (appraisal,
  governance, DBS, confidentiality) were cut because they carry no
  keywords a matcher should score on. Wording of the role, duties and
  requirements is otherwise unchanged.
- **Salary in the original advert:** £30,000–£35,000 a year.
- **Why this matters:** the old sample was a synthetic posting written
  for this repo. A real posting is longer, messier and full of
  employer-specific terms — exactly what a real ATS check has to cope
  with. The sample retail resume scores 36/100 against it (verified
  2026-11-20, CLI run on `sample_data/resume.txt` vs `job.txt`):
  5/101 keywords matched (2.5/50), 1/5 skills matched (4.0/20),
  15.0/15 experience & education, 15.0/15 formatting. The low keyword
  score is honest — a retail resume genuinely does not use healthcare
  data language — and it shows the tool discriminates instead of
  flattering every resume.
