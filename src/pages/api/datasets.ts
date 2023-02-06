import type {NextApiRequest, NextApiResponse} from 'next';
import datasetFetcher from '@/lib/dataset-fetcher-instance';
import {SearchOptions} from '@/lib/dataset-fetcher';

interface DatasetApiRequest extends NextApiRequest {
  query: {
    publishers: string | undefined;
    licenses: string | undefined;
    query: string | undefined;
  };
}

export default async function handler(
  req: DatasetApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).send({message: 'Only GET requests allowed'});
    return;
  }

  const {publishers, licenses, query} = req.query;

  const options: SearchOptions = {
    filters: {
      publishers: publishers?.split(',').filter(id => !!id),
      licenses: licenses?.split(',').filter(id => !!id),
    },
  };

  if (query) {
    options.query = query;
  }

  const searchResult = await datasetFetcher.search(options);

  res.status(200).json(searchResult);
}
