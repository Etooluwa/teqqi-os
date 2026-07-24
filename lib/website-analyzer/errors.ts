import type { AnalyzerFailureCode } from "@/lib/website-analyzer/types";

export class WebsiteAnalyzerError extends Error {
  readonly code: AnalyzerFailureCode;
  readonly httpStatus: number;

  constructor(code: AnalyzerFailureCode, message: string, httpStatus = 400) {
    super(message);
    this.name = "WebsiteAnalyzerError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
