import {PageSidebarContainer} from '@/components/page';
import datasetFetcher from '@/lib/dataset-fetcher-instance';
import {useLocale} from 'next-intl';
import DatasetList from './dataset-list';

export default async function Home() {
  const initialSearchResult = await datasetFetcher.search();
  const locale = useLocale();

  return (
    <PageSidebarContainer>
      <DatasetList initialSearchResult={initialSearchResult} locale={locale} />
    </PageSidebarContainer>
  );
}
