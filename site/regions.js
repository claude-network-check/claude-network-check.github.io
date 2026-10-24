// ISO codes from Anthropic's Supported Regions Policy (checked 2026-10-24, effective 2026-11-12),
// plus common territories of listed countries, which the policy also covers.
// https://www.anthropic.com/supported-countries
const listed = 'AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CO KM CG CD CR CI HR CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SO SB ZA KR SS ES LK SD SR SE CH TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VN ZM ZW';
const territories = 'PR GU VI AS MP UM GF GP MQ RE YT NC PF PM BL MF WF TF GL FO AW CW SX BQ BM KY GI VG IM JE GG AI MS TC FK SH IO PN GS AX SJ BV NF CX CC HM CK NU TK';
export const supportedRegions = new Set(`${listed} ${territories}`.split(' '));

/** true / false, or null when the country code is unknown. */
export function isSupported(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return null;
  return supportedRegions.has(code);
}

