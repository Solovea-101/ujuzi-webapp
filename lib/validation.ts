import { CATEGORIES, CERTIFICATE_NO_PATTERN, type Category, type CourseFilter } from '@/lib/db/types';

export type Valid<T> = { ok: true; value: T } | { ok: false; message: string };

// Kenya's 47 counties, title case, spelled the way the Constitution does. Shared with Kazi
// Connect and Sherehe: if one system spells a name differently, filters will not line up (R5).
export const KENYA_COUNTIES: readonly string[] = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo',
  'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale',
  'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  "Murang'a", 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya',
  'Taita-Taveta', 'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
  'Wajir', 'West Pokot',
];

/** The county's official spelling for any capitalisation of its name, or undefined. */
export function findCounty(input: string): string | undefined {
  const wanted = input.trim().toLowerCase();
  return KENYA_COUNTIES.find((county) => county.toLowerCase() === wanted);
}

function single(params: URLSearchParams, name: string): Valid<string | undefined> {
  const values = params.getAll(name);
  if (values.length > 1) return { ok: false, message: `${name} may only be given once` };
  return { ok: true, value: values[0] };
}

/** ?category= and ?county= for GET /api/courses. Absent means "any"; empty or unknown means 400. */
export function parseCourseFilter(params: URLSearchParams): Valid<CourseFilter> {
  const filter: CourseFilter = {};

  const category = single(params, 'category');
  if (!category.ok) return category;
  if (category.value !== undefined) {
    if (!CATEGORIES.includes(category.value as Category)) {
      return { ok: false, message: `category must be one of ${CATEGORIES.join(', ')}` };
    }
    filter.category = category.value as Category;
  }

  const county = single(params, 'county');
  if (!county.ok) return county;
  if (county.value !== undefined) {
    const official = findCounty(county.value);
    if (!official) {
      return { ok: false, message: "county must be one of Kenya's 47 counties, for example Nairobi" };
    }
    filter.county = official;
  }

  return { ok: true, value: filter };
}

export function parseCertificateNo(input: string): Valid<string> {
  if (!CERTIFICATE_NO_PATTERN.test(input)) {
    return { ok: false, message: 'certificateNo must look like UJZ-2026-00123' };
  }
  return { ok: true, value: input };
}
