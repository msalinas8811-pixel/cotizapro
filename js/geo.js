// CotizaPro — países y estados de EE.UU.
export const COUNTRIES = [
  ['US', 'Estados Unidos'], ['CA', 'Canadá'], ['MX', 'México'], ['PR', 'Puerto Rico'],
  ['SV', 'El Salvador'], ['GT', 'Guatemala'], ['HN', 'Honduras'], ['NI', 'Nicaragua'], ['CR', 'Costa Rica'], ['PA', 'Panamá'], ['BZ', 'Belice'],
  ['DO', 'República Dominicana'], ['CU', 'Cuba'],
  ['CO', 'Colombia'], ['VE', 'Venezuela'], ['EC', 'Ecuador'], ['PE', 'Perú'], ['BO', 'Bolivia'], ['CL', 'Chile'], ['AR', 'Argentina'], ['UY', 'Uruguay'], ['PY', 'Paraguay'], ['BR', 'Brasil'],
  ['ES', 'España'], ['OT', 'Otro país']
];

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'],
  ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'],
  ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']
];

export const countryName = (code) => (COUNTRIES.find((c) => c[0] === code) || [, ''])[1];

// Convierte lo que haya guardado ("Texas", "tx", "TX") al código del estado
export function stateCode(value) {
  const v = String(value || '').trim().toLowerCase();
  const f = US_STATES.find(([a, n]) => a.toLowerCase() === v || n.toLowerCase() === v);
  return f ? f[0] : '';
}
export const stateName = (code) => (US_STATES.find((s) => s[0] === code) || [, code])[1];
