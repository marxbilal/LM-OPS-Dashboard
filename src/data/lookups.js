// Business mappings used by the cleaning pipeline. Editable configuration:
// change a mapping here and every page picks it up after the next upload.

// Location -> [Location Type, Site name]
export const LOCATION_MAP = {
  'AMF 46 DISPLAY': ['Showroom / Display', '46 Display'],
  'AMF CEVA AMI': ['3PL Warehouse (CEVA)', 'CEVA AMI'],
  'AMF CEVA CPL': ['3PL Warehouse (CEVA)', 'CEVA CPL'],
  'AMF CEVA DWC': ['3PL Warehouse (CEVA)', 'CEVA DWC'],
  'AMF CEVA FOUR': ['3PL Warehouse (CEVA)', 'CEVA FOUR'],
  'AMF DAZ PENDING FOR DELIVERY': ['Pending Delivery', 'DAZ Pending Delivery'],
  'AMF KUWAIT': ['Overseas / ROW', 'Kuwait'],
  'AMF LEGEND YARD': ['Legend Yards', 'Legend Yard'],
  'AMF LEGEND YARD 2': ['Legend Yards', 'Legend Yard 2'],
  'AMF PENDING': ['Pending (unspecified)', 'AMF Pending'],
  'AMF PENDING EXPORT': ['Pending Delivery', 'Pending Export'],
  'AMF PENDING RECEIVING': ['Pending Receiving', 'Pending Receiving'],
  'AMF ROW': ['Overseas / ROW', 'ROW'],
  'LMF - DAZ KAIYI': ['Brand Yards / Showrooms', 'DAZ KAIYI'],
  'LMF - JAFZA BAW 212': ['Brand Yards / Showrooms', 'JAFZA BAW 212'],
  'LMF - JAFZA JIYUE': ['Brand Yards / Showrooms', 'JAFZA JIYUE'],
  'LMF - JAFZA KAIYI': ['Brand Yards / Showrooms', 'JAFZA KAIYI'],
  'LMF - JAFZA LI AUTO': ['Brand Yards / Showrooms', 'JAFZA LI AUTO'],
  'LMF - JAFZA SKYWELL': ['Brand Yards / Showrooms', 'JAFZA SKYWELL'],
  'LMF -DAZ -JIYUE-268': ['Brand Yards / Showrooms', 'DAZ JIYUE 268'],
  'LMF 46 DISPLAY': ['Showroom / Display', '46 Display'],
  'LMF 46 PENDING DELIVERY': ['Pending Delivery', '46 Pending Delivery'],
  'LMF APEX YARD': ['Partner / Port Yards', 'Apex Yard'],
  'LMF AWEER DSC': ['Showroom / Display', 'Aweer DSC'],
  'LMF CEVA AMI': ['3PL Warehouse (CEVA)', 'CEVA AMI'],
  'LMF CEVA CPL': ['3PL Warehouse (CEVA)', 'CEVA CPL'],
  'LMF CEVA DWC': ['3PL Warehouse (CEVA)', 'CEVA DWC'],
  'LMF CEVA FOUR': ['3PL Warehouse (CEVA)', 'CEVA FOUR'],
  'LMF CEVA GEFCO 3': ['3PL Warehouse (CEVA)', 'CEVA GEFCO 3'],
  'LMF CEVA INTERLOCK DWC': ['3PL Warehouse (CEVA)', 'CEVA Interlock DWC'],
  'LMF CEVA TP157': ['3PL Warehouse (CEVA)', 'CEVA TP157'],
  'LMF DAZ DISPLAY': ['Showroom / Display', 'DAZ Display'],
  'LMF DAZ PENDING FOR DELIVERY': ['Pending Delivery', 'DAZ Pending Delivery'],
  'LMF DP SOUTH YARD': ['Partner / Port Yards', 'DP South Yard'],
  'LMF DP WORLD': ['Partner / Port Yards', 'DP World'],
  'LMF GALLEGA YARD': ['Partner / Port Yards', 'Gallega Yard'],
  'LMF JAFZA DISPLAY': ['Showroom / Display', 'JAFZA Display'],
  'LMF JAFZA DP YARD': ['Partner / Port Yards', 'JAFZA DP Yard'],
  'LMF JAFZA PENDING': ['Pending (unspecified)', 'JAFZA Pending'],
  'LMF KAIYI JAFZA DP YARD': ['Brand Yards / Showrooms', 'KAIYI JAFZA DP Yard'],
  'LMF LEGEND YARD': ['Legend Yards', 'Legend Yard'],
  'LMF LEGEND YARD 2': ['Legend Yards', 'Legend Yard 2'],
  'LMF PENDING RECEIVING': ['Pending Receiving', 'Pending Receiving'],
  'LMF PROLINES YARD': ['Partner / Port Yards', 'Prolines Yard'],
  'LMF ROW': ['Overseas / ROW', 'ROW'],
  'LMF ROW - CHINA DEAL': ['Overseas / ROW', 'ROW China Deal'],
  'LMF SEAGLE YARD': ['Partner / Port Yards', 'Seagle Yard'],
  'LMF THIRD PARTY': ['Partner / Port Yards', 'Third Party'],
  'LMF-DAZ AL QOUZ': ['Showroom / Display', 'DAZ Al Qouz'],
  'LMF-DAZ ML DISPLAY': ['Showroom / Display', 'DAZ ML Display'],
  'LMF-DAZ-26': ['Showroom / Display', 'DAZ 26'],
  'LMF-DAZ-268': ['Showroom / Display', 'DAZ 268'],
  'LMM 116': ['Showroom / Display', 'LMM 116'],
  'LMM 46': ['Showroom / Display', 'LMM 46'],
  'LMM 46 ACCESSORIES': ['Showroom / Display', 'LMM 46 Accessories'],
  'LMM 46 FOR DELIVERY': ['Pending Delivery', 'LMM 46 For Delivery'],
  'LMM AL QOUZ': ['Showroom / Display', 'LMM Al Qouz'],
  'LMM AWEER DSC': ['Showroom / Display', 'Aweer DSC'],
  'LMM IN TRANSIT': ['Pending Receiving', 'LMM In Transit'],
  'LMM ML DISPLAY': ['Showroom / Display', 'LMM ML Display'],
  'LMM-JIYUE LMM 46': ['Brand Yards / Showrooms', 'JIYUE LMM 46'],
};

export const LOCATION_TYPES = ['Legend Yards', '3PL Warehouse (CEVA)', 'Partner / Port Yards', 'Brand Yards / Showrooms',
  'Showroom / Display', 'Pending Delivery', 'Pending Receiving', 'Overseas / ROW', 'Pending (unspecified)', 'Other'];

// Placeholder values that mean "not filled in"
export const JUNK = new Set(['', '-', '--', '`', '``', '.', '0', '00', '000', '0000', 'N/A', 'NA', 'NIL', 'NILL', 'NONE', 'TBA', 'TBD', '123']);

export const BRAND_MAP = { 'MAZDA 3': 'MAZDA', 'MAZDA : MAZDA': 'MAZDA' };

// ------------------------------------------------------------------ ports
const PORT_RULES = [
  [/JEBEL ALI|JABEL ALI|KHORFAKKAN/, 'Jebel Ali', 'UAE'],
  [/^FUJ|FUJAIRAH|FUJIRAH/, 'Fujairah', 'UAE'],
  [/SOHAR/, 'Sohar', 'Oman'],
  [/DUCM|DUQM/, 'Duqm', 'Oman'],
  [/NINGBO/, 'Ningbo', 'China'],
  [/SHANGHAI/, 'Shanghai', 'China'],
  [/NANSHA/, 'Nansha', 'China'],
  [/XINSHA/, 'Xinsha', 'China'],
  [/SHEKOU/, 'Shekou', 'China'],
  [/FUZHOU/, 'Fuzhou', 'China'],
  [/QINGDAO/, 'Qingdao', 'China'],
  [/TIANJIN|XINGANG/, 'Tianjin', 'China'],
  [/^CHINA$/, 'China (port not given)', 'China'],
  [/KUWAIT/, 'Kuwait', 'Kuwait'],
  [/^UAE$/, 'UAE (port not given)', 'UAE'],
];

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function cleanPort(v) {
  if (v == null) return [null, null];
  const u = String(v).toUpperCase().trim();
  if (JUNK.has(u) || !/[A-Z]/.test(u)) return [null, null];
  for (const [re, name, ctry] of PORT_RULES) if (re.test(u)) return [name, ctry];
  if (/^[A-Z]{4}\w*\d{4,}$/.test(u)) return [null, null]; // a BL number typed into a port field
  return [titleCase(u), null];
}

// ------------------------------------------------------------------ destinations
const DEST_UNSPEC = new Set(['0', '00', '0000', '.', '123', 'PENDING', 'PANDING', 'LATER', 'NILL', 'NIL', 'TBD', 'ANOTHER',
  'EXPORT', 'EXPORT CAR', 'KA', 'DU', 'DIRECT DELIVER', 'AFRICA', 'SHAD', 'TOMA', 'ATLANTIS', 'BRIGHT RIVER']);
const LOCAL_TRANSFER = /JAFZA|JAVZA|JAZFA|JAFAZA|JA TRANSFER|JEBEL ALI TR|JEBEL TRANSFER|DUCAMZ|DOCAMZ|^DUCA$|FZ TRANSFER|GLOBELINK|GLOBALINK|GLOBAL LINK|GLOBE LINK|DAZ TRANSFER|SHOWROOM TRANSFER|ABU DHABI TRANSFER|TRANSFER BANIYAS|COASTAL BERTH|COSTAL BERTH|COASTER BERTH/;
const COUNTRY_RULES = [
  [/AZERBA|AZERBJ|AZERBAJ|AZERBAI/, 'Azerbaijan'],
  [/IRAQ|BASRA|UMM QASR|IQBSR|KHASAB TO IRAQ/, 'Iraq'],
  [/KAZ|KHAZ|KASAK|KHORGOS|AKTAU/, 'Kazakhstan'],
  [/JORD|AQABA|NASIB/, 'Jordan'],
  [/DJIBOU|DIJUBAT|DJBOUT|DJUBAT|DJIBOUI/, 'Djibouti'],
  [/ETHIOP|EHTIOP|^ETH$|ADDIS ABABA/, 'Ethiopia'],
  [/XINGANG|TIANJIN|TIANIJN|TIANIJIN|TINAJIN|^CHINA$/, 'China'],
  [/EGYPT|SAFAG|SAFGA|SUEZ|CAIRO/, 'Egypt'],
  [/ARMEN|ARMAN|ARMINA|ARMEMEN/, 'Armenia'],
  [/TURKMEN|TURKUMEN/, 'Turkmenistan'],
  [/\bOMAN|SOHAR|MUSCAT|MAGHBELLA|MEZYAD|KHATM AL SHIKLA|HART BODER|HATTA/, 'Oman'],
  [/UZBEK/, 'Uzbekistan'],
  [/GHANA|\bTEMA\b|^TIMA$|ACCRA/, 'Ghana'],
  [/SAUDI|DAMMAM|RIYADH|GHUWAIFAT|GWIFHAT|JEDDAH/, 'Saudi Arabia'],
  [/\bIRAN|LENGEH|\bKISH\b/, 'Iran'],
  [/SYRIA/, 'Syria'],
  [/BENIN|COTONOU/, 'Benin'],
  [/ALGER|ALGIER|MOSTAGANEM|DJEN DJEN/, 'Algeria'],
  [/NIGERIA|NIGERA|NIGERIS|APAPA|LAGOS/, 'Nigeria'],
  [/^NIGER$/, 'Niger'],
  [/IVORY|ABIDJAN|ABIJAN/, 'Ivory Coast'],
  [/\bCHAD\b/, 'Chad'],
  [/LEBANON|BEIRUT/, 'Lebanon'],
  [/TUNIS|RADES|SFAX/, 'Tunisia'],
  [/ANGOLA|LUANDA/, 'Angola'],
  [/KUWAIT/, 'Kuwait'],
  [/MAURITANIA|NOUAKCHOTT/, 'Mauritania'],
  [/PAKISTAN|KARACHI/, 'Pakistan'],
  [/QATAR/, 'Qatar'],
  [/RUBAVU|RWANDA/, 'Rwanda'],
  [/GUINEA|GUNIEA|CONAKRY|CONKARY|GNCKY/, 'Guinea'],
  [/ALBANIA|DURRES|DURESS/, 'Albania'],
  [/CAMBODIA|SIHANOUKVILLE/, 'Cambodia'],
  [/BAHRAIN/, 'Bahrain'],
  [/SPAIN/, 'Spain'],
  [/CAMEROON|CAMERON|DOUALA|DWALA|DOUAL/, 'Cameroon'],
  [/KYRGYZ|KYRGYS/, 'Kyrgyzstan'],
  [/VENEZ|GUAIRA|GUIRA|MARACAIBO|PUERTO CABELLO/, 'Venezuela'],
  [/GEORGIA/, 'Georgia'],
  [/BOLIVIA/, 'Bolivia'],
  [/CONGO|MATADI|POITE NOIRE/, 'Congo'],
  [/\bMALI\b/, 'Mali'],
  [/THAILAND|LAEM ?CHABANG/, 'Thailand'],
  [/MOZAMBIQUE/, 'Mozambique'],
  [/GABON|LIBREVILLE|PORT-GENTIL/, 'Gabon'],
  [/CHILE|IQUIQUE|ARICA/, 'Chile'],
  [/TAJIK|TAJISK/, 'Tajikistan'],
  [/COMOR|MORONI/, 'Comoros'],
  [/SENEGAL|DAKAR/, 'Senegal'],
  [/ARGENTINA/, 'Argentina'],
  [/MYANMAR|YANGON/, 'Myanmar'],
  [/CZECH/, 'Czech Republic'],
  [/BURKINA/, 'Burkina Faso'],
  [/\bTOGO\b|\bLOME\b/, 'Togo'],
  [/GUATEMALA|QUETZAL/, 'Guatemala'],
  [/GAMBIA/, 'Gambia'],
  [/MOROCCO/, 'Morocco'],
  [/LIBERIA|MONROVIA/, 'Liberia'],
  [/DENMARK/, 'Denmark'],
  [/GERMANY/, 'Germany'],
  [/NETHERLANDS|ROTTERDAM/, 'Netherlands'],
  [/UNITED KINGDOM/, 'United Kingdom'],
  [/HAITI/, 'Haiti'],
  [/MADAGASCAR|DIEGO SUAREZ/, 'Madagascar'],
  [/TANZANIA|DAR ES SALA/, 'Tanzania'],
  [/ANDORRA/, 'Andorra'],
  [/BURUNDI/, 'Burundi'],
  [/SIERRA LEONE/, 'Sierra Leone'],
  [/COLOMBIA/, 'Colombia'],
  [/PARAGUAY/, 'Paraguay'],
  [/POLAND/, 'Poland'],
  [/PHILIPPINES/, 'Philippines'],
  [/COSTA RICA/, 'Costa Rica'],
  [/KENYA/, 'Kenya'],
];
const UAE_LOCAL = /UNITED ARAB EMIRATES|^UAE$|^DUBAI|LOCAL|ABU ?DHABI|^JEBEL ALI$|JEBEL ALI PORT|JABEL|JEBAL ALI|^AWIR$|AJMAN|SHAJAH|SHARJAH|HAMRIYA|^DAZ$|SHOWROOM|AL AIN|CIF- DUBAI/;
const PARTY = /FZE|FZCO|L\.?L\.?C|MOTORS|TRADING|SHIPPING|LOGISTIC|FREIGHT|CARGO|WAREHOUSING|RENT A CAR|AUTOMOBILE|STALCO|MIRAMAR|BONN|RYAN/;

export const DEST_TYPES = ['Export', 'Local transfer (free zone / forwarder)', 'UAE local',
  'Party name entered instead of destination', 'Unspecified', 'Unmapped value', 'Not set'];

/** Returns [Destination Country, Destination Type]. */
export function cleanDestination(v) {
  if (v == null) return ['Not set', 'Not set'];
  const u = String(v).toUpperCase().replace(/\s+/g, ' ').trim();
  if (DEST_UNSPEC.has(u) || !/[A-Z]/.test(u)) return ['Unspecified', 'Unspecified'];
  for (const [re, ctry] of COUNTRY_RULES) if (re.test(u)) return [ctry, 'Export'];
  if (LOCAL_TRANSFER.test(u)) return ['UAE', 'Local transfer (free zone / forwarder)'];
  if (UAE_LOCAL.test(u)) return ['UAE', 'UAE local'];
  if (PARTY.test(u)) return ['Unspecified', 'Party name entered instead of destination'];
  return ['Unspecified', 'Unmapped value'];
}
