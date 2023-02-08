import {SearchResult} from '@/lib/dataset-fetcher';

interface SearchDatasets {
  licenses: string[];
  publishers: string[];
}

// Only use this function for client components.
// For server component use the dataset-fetcher directly.
export async function clientSearchDatasets({
  licenses,
  publishers,
}: SearchDatasets): Promise<SearchResult> {
  const searchParams = {
    licenses: licenses.join(','),
    publishers: publishers.join(','),
  };

  const response = await fetch(
    '/api/datasets?' + new URLSearchParams(searchParams)
  );

  if (!response.ok) {
    throw new Error(
      'There was a problem fetching the datasets. Please reload the page to try again.'
    );
  }
  return response.json();
}