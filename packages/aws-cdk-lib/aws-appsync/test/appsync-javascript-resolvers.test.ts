import * as path from 'path';
import { Template } from '../../assertions';
import * as lambda from '../../aws-lambda';
import * as cdk from '../../core';
import * as appsync from '../lib';

let stack: cdk.Stack;
let api: appsync.GraphqlApi;

beforeEach(() => {
  // GIVEN
  stack = new cdk.Stack();
  api = new appsync.GraphqlApi(stack, 'api', {
    name: 'api',
    schema: appsync.SchemaFile.fromAsset(path.join(__dirname, 'appsync.lambda.graphql')),
  });
});

describe('Configure Js unit resolver', () => {
  // GIVEN
  let func: lambda.Function;
  beforeEach(() => {
    func = new lambda.Function(stack, 'func', {
      code: lambda.Code.fromAsset(path.join(__dirname, 'verify/lambda-tutorial')),
      handler: 'lambda-tutorial.handler',
      runtime: lambda.Runtime.NODEJS_LATEST,
    });
  });

  test('find resolver in default `resolvers` folder', () => {
    // WHEN
    const lambdaDS = api.addLambdaDataSource('LambdaDS', func);

    lambdaDS.createJsResolver('Query', 'allPosts');

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AppSync::Resolver', {
      TypeName: 'Query',
      FieldName: 'allPosts',
      Kind: 'UNIT',
      Runtime: {
        Name: 'APPSYNC_JS',
        RuntimeVersion: '1.0.0',
      },
    });
  });

  test('find resolver in default `resolverDir folder', () => {
    // WHEN
    const lambdaDS = api.addLambdaDataSource('LambdaDS', func);

    lambdaDS.createJsResolver('Query', 'allPosts', { resolverDir: path.join(__dirname, 'integ-assets', 'resolvers') });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AppSync::Resolver', {
      TypeName: 'Query',
      FieldName: 'allPosts',
    });
  });

  test('find resolvers in separate locations', () => {
    // WHEN
    const lambdaDS = api.addLambdaDataSource('LambdaDS', func);

    lambdaDS.createJsResolver('Query', 'allPosts', { resolverDir: path.join(__dirname, 'integ-assets', 'resolvers') });
    lambdaDS.createJsResolver('Query', 'getPost', { resolverFile: path.join(__dirname, 'integ-assets', 'resolvers', 'my-resolver.js') });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::AppSync::Resolver', {
      TypeName: 'Query',
      FieldName: 'allPosts',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::AppSync::Resolver', {
      TypeName: 'Query',
      FieldName: 'getPost',
    });
  });
});
