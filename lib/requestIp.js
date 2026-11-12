// The visitor's IP address, used only to compute the hashed rate-limit ID.
// On Vercel, Vercel's own edge sets this header, so visitors can't fake it.
import { ipAddress } from '@vercel/functions';

export function visitorIp(request) {
  const fromVercel = ipAddress(request);
  if (fromVercel) return fromVercel;
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'local';
}
