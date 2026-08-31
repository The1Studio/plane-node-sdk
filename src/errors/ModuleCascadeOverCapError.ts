import { HttpError } from "./HttpError";
import { ModuleCascadeErrorBody } from "../models/CascadeExt";

/**
 * Thrown by `CascadeExt.apply` when the module cascade is refused instead of
 * executed — server returns `400` with body
 * `{ "error": string, "cap": number, "total_live": number }` (or an archived
 * module refusal without the count fields).
 *
 * The over-cap refusal is a READABLE REFUSAL, not a transport failure: the
 * server has written NOTHING (the requested module status included), so a
 * headless caller must NOT retry the cascade — it should fall back to a plain
 * module status PATCH. Exposing `cap` and `total_live` as typed fields lets
 * the caller branch on the refusal instead of parsing `message` text.
 */
export class ModuleCascadeOverCapError extends HttpError {
  public readonly errorCode = "MODULE_CASCADE_OVER_CAP" as const;
  /** The cascade cap (`MAX_MODULE_CASCADE_ITEMS`, surfaced by the server). */
  public readonly cap?: number;
  /** Live work items in the module tree at refusal time. */
  public readonly totalLive?: number;

  constructor(message: string, statusCode: number, response?: ModuleCascadeErrorBody) {
    super(message, statusCode, response);
    this.name = "ModuleCascadeOverCapError";
    this.cap = response?.cap;
    this.totalLive = response?.total_live;
  }
}