import { describe, expect, it } from "vitest";
import { compareJobs } from "./compare";

const stored = { employerName: "Harbor & Pine Capital", title: "Associate", startMonth: "2019-06" };

describe("comparing the stored job with the job on the page", () => {
  it("no stored job and none on the page: unchanged", () => {
    expect(compareJobs(null, null)).toEqual({ result: "unchanged" });
  });

  it("a stored job and none on the page: needs manual review", () => {
    expect(compareJobs(stored, null)).toEqual({ result: "needs-manual-review" });
  });

  it("same employer and same title: unchanged, whatever the spacing, case or punctuation", () => {
    expect(
      compareJobs(stored, {
        employerName: "harbor and pine capital".replace("and ", "& "),
        title: "  ASSOCIATE ",
        startMonth: "2019-06",
      }),
    ).toEqual({ result: "unchanged" });
    expect(
      compareJobs(
        { ...stored, title: "Senior  Associate" },
        { employerName: "Harbor & Pine Capital", title: "senior associate", startMonth: null },
      ),
    ).toEqual({ result: "unchanged" });
  });

  it("ignores a different start month when employer and title match", () => {
    expect(compareJobs(stored, { ...stored, startMonth: "2020-01" })).toEqual({
      result: "unchanged",
    });
  });

  it("same employer, different title, later start month on the page: a new current job", () => {
    expect(
      compareJobs(stored, { ...stored, title: "Vice President", startMonth: "2024-02" }),
    ).toEqual({ result: "new-job" });
  });

  it.each([
    ["the page has no start month", null, "2019-06"],
    ["the stored job has no start month", "2024-02", null],
    ["the start months are the same", "2019-06", "2019-06"],
    ["the page's start month is earlier", "2018-01", "2019-06"],
  ])("same employer, different title, %s: a title correction", (_label, readStart, storedStart) => {
    expect(
      compareJobs(
        { ...stored, startMonth: storedStart },
        { ...stored, title: " Senior Associate ", startMonth: readStart },
      ),
    ).toEqual({ result: "title-correction", title: "Senior Associate" });
  });

  it("a different employer: a new current job", () => {
    expect(
      compareJobs(stored, { employerName: "Juniper Row", title: "Associate", startMonth: null }),
    ).toEqual({ result: "new-job" });
  });

  it("no stored job and a job on the page: a new current job", () => {
    expect(compareJobs(null, stored)).toEqual({ result: "new-job" });
  });
});
