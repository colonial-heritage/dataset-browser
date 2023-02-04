import {reach} from '@hapi/hoek';
import {request} from 'gaxios';
import {z} from 'zod';

const constructorOptionsSchema = z.object({
  endpointUrl: z.string(),
});

export type ConstructorOptions = z.infer<typeof constructorOptionsSchema>;

export type Publisher = {
  id: string;
  name: string;
};

export type License = {
  id: string;
  name: string;
};

export type Dataset = {
  id: string;
  name: string;
  description?: string;
  publisher: Publisher;
  license: License;
};

// TODO: add sorting capabilities
// TBD: add language option, for returning results in a specific locale (e.g. 'nl', 'en')?
const searchOptionsSchema = z.object({
  query: z.string().optional().default('*'), // If no query provided, match all
  offset: z.number().int().nonnegative().optional().default(0),
  limit: z.number().int().positive().optional().default(10),
  filters: z
    .object({
      publishers: z.array(z.string()).optional().default([]),
      licenses: z.array(z.string()).optional().default([]),
    })
    .optional(),
});

export type SearchOptions = z.input<typeof searchOptionsSchema>;

enum RawDatasetKeys {
  Id = '@id',
  Type = 'http://www w3 org/1999/02/22-rdf-syntax-ns#type',
  Name = 'https://colonialcollections nl/search#name',
  Description = 'https://colonialcollections nl/search#description',
  PublisherIri = 'https://colonialcollections nl/search#publisherIri',
  PublisherName = 'https://colonialcollections nl/search#publisherName',
  LicenseIri = 'https://colonialcollections nl/search#licenseIri',
  LicenseName = 'https://colonialcollections nl/search#licenseName',
}

const rawDatasetSchema = z
  .object({})
  .setKey(RawDatasetKeys.Id, z.string())
  .setKey(RawDatasetKeys.Name, z.array(z.string()).min(1))
  .setKey(RawDatasetKeys.Description, z.array(z.string()).optional())
  .setKey(RawDatasetKeys.PublisherIri, z.array(z.string()).min(1))
  .setKey(RawDatasetKeys.PublisherName, z.array(z.string()).min(1))
  .setKey(RawDatasetKeys.LicenseIri, z.array(z.string()).min(1))
  .setKey(RawDatasetKeys.LicenseName, z.array(z.string()).min(1));

type RawDataset = z.infer<typeof rawDatasetSchema>;

const rawBucketSchema = z.object({
  key: z.array(z.string()),
  doc_count: z.number(),
});

type RawBucket = z.infer<typeof rawBucketSchema>;

const rawAggregationSchema = z.object({
  buckets: z.array(rawBucketSchema),
});

const rawSearchResponseSchema = z.object({
  data: z.object({
    hits: z.object({
      total: z.object({
        value: z.number(),
      }),
      hits: z.array(
        z.object({
          _source: rawDatasetSchema,
        })
      ),
    }),
    aggregations: z.object({
      all: z.object({
        publishers: rawAggregationSchema,
        licenses: rawAggregationSchema,
      }),
      publishers: rawAggregationSchema,
      licenses: rawAggregationSchema,
    }),
  }),
});

type RawSearchResponse = z.infer<typeof rawSearchResponseSchema>;

export type SearchResultFilter = {
  totalCount: number;
  name: string;
  id?: string; // TBD: if a filter does not match the query, is there a way to return its ID?
};

export type SearchResult = {
  totalCount: number;
  offset: number;
  limit: number;
  datasets: Dataset[];
  filters?: {
    publishers: SearchResultFilter[];
    licenses: SearchResultFilter[];
  };
};

export class DatasetFetcher {
  private endpointUrl: string;

  constructor(options: ConstructorOptions) {
    const opts = constructorOptionsSchema.parse(options);
    this.endpointUrl = opts.endpointUrl;
  }

  async makeSearchRequest(
    searchParams: Record<string, unknown>
  ): Promise<RawSearchResponse> {
    // Elastic's '@elastic/elasticsearch' package does not work with TriplyDB's
    // Elasticsearch instance, so we use pure HTTP calls instead
    const rawSearchResponse = await request({
      url: this.endpointUrl,
      data: searchParams,
      method: 'POST',
      timeout: 5000,
      retryConfig: {
        retry: 3,
        noResponseRetries: 3, // E.g. in case of timeouts
        httpMethodsToRetry: ['POST'],
      },
    });

    const parsedRawSearchResponse =
      rawSearchResponseSchema.parse(rawSearchResponse);

    return parsedRawSearchResponse;
  }

  // Map the response to our internal model
  private fromRawDatasetToDataset(rawDataset: RawDataset) {
    const name = reach(rawDataset, `${RawDatasetKeys.Name}.0`);
    const description = reach(rawDataset, `${RawDatasetKeys.Description}.0`);
    const publisher: Publisher = {
      id: reach(rawDataset, `${RawDatasetKeys.PublisherIri}.0`),
      name: reach(rawDataset, `${RawDatasetKeys.PublisherName}.0`),
    };
    const license: License = {
      id: reach(rawDataset, `${RawDatasetKeys.LicenseIri}.0`),
      name: reach(rawDataset, `${RawDatasetKeys.LicenseName}.0`),
    };

    return {
      id: rawDataset[RawDatasetKeys.Id],
      name,
      description,
      publisher,
      license,
    };
  }

  private buildAggregation(id: string, name: string): object {
    const aggregation = {
      // Aggregate the hits by ID and name (for display)
      multi_terms: {
        terms: [{field: `${id}.keyword`}, {field: `${name}.keyword`}],
      },
    };

    return aggregation;
  }

  private buildSearchParams(options: SearchOptions) {
    const publishersAggegration = this.buildAggregation(
      RawDatasetKeys.PublisherIri,
      RawDatasetKeys.PublisherName
    );
    const licensesAggregation = this.buildAggregation(
      RawDatasetKeys.LicenseIri,
      RawDatasetKeys.LicenseName
    );

    const searchParams = {
      size: options.limit,
      from: options.offset,
      query: {
        bool: {
          must: [
            {
              simple_query_string: {
                query: options.query,
                default_operator: 'and',
              },
            },
          ],
          filter: [
            // TBD: add filter for language?
            {
              // Only return documents of type 'Dataset'
              terms: {
                [`${RawDatasetKeys.Type}.keyword`]: [
                  'https://colonialcollections.nl/search#Dataset',
                ],
              },
            },
          ],
        },
      },
      aggregations: {
        all: {
          global: {},
          aggregations: {
            publishers: publishersAggegration,
            licenses: licensesAggregation,
          },
        },
        publishers: publishersAggegration,
        licenses: licensesAggregation,
      },
    };

    if (options.filters?.publishers?.length) {
      searchParams.query.bool.filter.push({
        terms: {
          [`${RawDatasetKeys.PublisherIri}.keyword`]:
            options.filters?.publishers,
        },
      });
    }

    if (options.filters?.licenses?.length) {
      searchParams.query.bool.filter.push({
        terms: {
          [`${RawDatasetKeys.LicenseIri}.keyword`]: options.filters?.licenses,
        },
      });
    }

    return searchParams;
  }

  private buildSearchResult(
    options: SearchOptions,
    rawSearchResponse: RawSearchResponse
  ) {
    const hits = rawSearchResponse.data.hits;

    const datasets: Dataset[] = hits.hits.map(hit => {
      const rawDataset = hit._source;
      return this.fromRawDatasetToDataset(rawDataset);
    });

    const aggregations = rawSearchResponse.data.aggregations;

    const toFilter = (bucket: RawBucket): SearchResultFilter => {
      const [id, name] = bucket.key;
      const totalCount = bucket.doc_count;
      return {
        totalCount,
        name,
        id,
      };
    };

    const publishersFilters = aggregations.publishers.buckets.map(toFilter);
    const licenseFilters = aggregations.licenses.buckets.map(toFilter);

    const searchResult: SearchResult = {
      totalCount: hits.total.value,
      offset: options.offset!,
      limit: options.limit!,
      datasets,
      filters: {
        publishers: publishersFilters,
        licenses: licenseFilters,
      },
    };

    return searchResult;
  }

  async search(options?: SearchOptions): Promise<SearchResult> {
    const opts = searchOptionsSchema.parse(options ?? {});

    const searchParams = this.buildSearchParams(opts);
    const searchResponse = await this.makeSearchRequest(searchParams);
    const searchResult = this.buildSearchResult(opts, searchResponse);

    return searchResult;
  }
}
