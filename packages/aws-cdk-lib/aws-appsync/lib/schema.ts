import { readFileSync } from 'fs';
import { IGraphqlApi } from './graphqlapi-base';
import * as s3_assets from '../../aws-s3-assets';
import * as cdk from '../../core';

/**
 * Configuration for bound graphql schema
 *
 * Returned from ISchema.bind allowing late binding of schemas to graphqlapi-base
 */
export interface ISchemaConfig {
  /**
   * The ID of the api the schema is bound to
   */
  apiId: string;

  /**
   * The schema definition string
   */
  definition?: string;

  /**
   * The location of the schema file in S3 (mutually exclusive with `definition`).
   */
  definitionS3Location?: string;
}

/**
 * Used for configuring schema bind behavior.
 *
 * This is intended to prevent breaking changes to implementors of ISchema
 * if needing to add new behavior.
 */
export interface SchemaBindOptions {}

/**
 * Interface for implementing your own schema
 *
 * Useful for providing schema's from sources other than assets
 */
export interface ISchema {
  /**
   * Binds a schema string to a GraphQlApi
   *
   * @returns ISchemaConfig with apiId and schema definition string
   * @param api the api to bind the schema to
   * @param options configuration for bind behavior
   */
  bind(api: IGraphqlApi, options?: SchemaBindOptions): ISchemaConfig;
}

/**
 * The options for configuring a schema from an existing file
 */
export interface SchemaProps {
  /**
   * The file path for the schema. When this option is
   * configured, then the schema will be generated from an
   * existing file from disk.
   */
  readonly filePath: string;
}

/**
 * The Schema for a GraphQL Api
 *
 * If no options are configured, schema will be generated
 * code-first.
 */
export class SchemaFile implements ISchema {
  /**
   * Generate a Schema from file
   *
   * @returns `SchemaAsset` with immutable schema defintion
   * @param filePath the file path of the schema file
   */
  public static fromAsset(filePath: string): SchemaFile {
    return new SchemaFile({ filePath });
  }

  /**
   * The definition for this schema
   */
  public definition: string;

  public constructor(options: SchemaProps) {
    this.definition = readFileSync(options.filePath).toString('utf-8');
  }

  /**
   * Called when the GraphQL Api is initialized to allow this object to bind
   * to the stack.
   *
   * @param api The binding GraphQL Api
   */
  public bind(api: IGraphqlApi, _options?: SchemaBindOptions): ISchemaConfig {
    return {
      apiId: api.apiId,
      definition: this.definition,
    };
  }
}

/**
 * The Schema for a GraphQL Api backed by an S3 location
 */
export class SchemaAsset implements ISchema {
  /**
   * Generate a Schema from file
   *
   * @returns `SchemaAsset` with immutable schema defintion
   * @param path the file path of the schema file
   */
  public static fromAsset(path: string, options?: s3_assets.AssetOptions): SchemaAsset {
    return new SchemaAsset(path, options);
  }

  private asset?: s3_assets.Asset;

  public constructor(public readonly path: string, private readonly options: s3_assets.AssetOptions = {}) {}

  public bind(api: IGraphqlApi, _options?: SchemaBindOptions): ISchemaConfig {
    // If the same AssetCode is used multiple times, retain only the first instantiation.
    if (!this.asset) {
      this.asset = new s3_assets.Asset(api, 'schema', { path: this.path, ...this.options });
    } else if (cdk.Stack.of(this.asset) !== cdk.Stack.of(api)) {
      throw new Error(`Asset is already associated with another stack '${cdk.Stack.of(this.asset).stackName}'. ` + 'Create a new schema instance for every stack.');
    }

    return {
      apiId: api.apiId,
      definitionS3Location: this.asset.s3ObjectUrl,
    };
  }
}
