import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { generateBatch } from "../shared/util";
import { books } from "../seed/books";

export class DistSystemsCa1Stack extends cdk.Stack {
  // AUTHENTICATION
  private auth: apig.IResource;
  private userPoolId: string;
  private userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AUTHENTICATION
    const userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    this.userPoolClientId = appClient.userPoolClientId;

    const authApi = new apig.RestApi(this, "AuthServiceApi", {
      description: "Authentication Service RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    this.auth = authApi.root.addResource("auth");
    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: "./lambdas/auth/authorizer.ts",
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    this.addAuthRoute(
      "signup",
      "POST",
      "SignupFn",
      'signup.ts'
    );

    this.addAuthRoute(
      "confirm_signup",
      "POST",
      "ConfirmFn",
      "confirm-signup.ts"
    );

    this.addAuthRoute('signout', 'GET', 'SignoutFn', 'signout.ts');
    this.addAuthRoute('signin', 'POST', 'SigninFn', 'signin.ts');


    // Tables 
    const booksTable = new dynamodb.Table(this, "BooksTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Books",
    });

    // Functions
    const getAllBooksFn = new lambdanode.NodejsFunction(
      this,
      "GetAllBooksFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/getAllBooks.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: booksTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const newBookFn = new lambdanode.NodejsFunction(this, "AddBookFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/addBook.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: booksTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const getBookByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetBookByIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/getBookById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: booksTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const deleteBookFn = new lambdanode.NodejsFunction(this, "DeleteBookFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/deleteBook.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: booksTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const updateBookFn = new lambdanode.NodejsFunction(this, "UpdateBookFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/updateBook.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: booksTable.tableName,
        REGION: "eu-west-1",
      },
    });

    //Permissions
    booksTable.grantReadData(getAllBooksFn)
    booksTable.grantReadWriteData(newBookFn)
    booksTable.grantReadData(getBookByIdFn)
    booksTable.grantReadWriteData(deleteBookFn)
    booksTable.grantReadWriteData(updateBookFn)
    // REST API
    const api = new apig.RestApi(this, "RestAPI", {
      description: "books api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    //Endpoints
    const booksEndpoint = api.root.addResource("books");

    // Public GET 
    booksEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllBooksFn, { proxy: true }),
      {
        authorizer: requestAuthorizer, 
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // Protected POST 
    booksEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(newBookFn, { proxy: true }),
      {
        authorizer: requestAuthorizer, 
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    const bookEndpoint = booksEndpoint.addResource("{id}");

    // Public GET 
    bookEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getBookByIdFn, { proxy: true })
    );

    // Protected DELETE
    bookEndpoint.addMethod(
      "DELETE",
      new apig.LambdaIntegration(deleteBookFn, { proxy: true }),
      {
        authorizer: requestAuthorizer, 
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // Protected PUT
    bookEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(updateBookFn, { proxy: true }),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // AWS Resource
    new custom.AwsCustomResource(this, "booksddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [booksTable.tableName]: generateBatch(books),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("bookssddbInitData"),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [booksTable.tableArn],
      }),
    });
  }
  private addAuthRoute(
    resourceName: string,
    method: string,
    fnName: string,
    fnEntry: string
  ): void {
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    const resource = this.auth.addResource(resourceName);

    const fn = new lambdanode.NodejsFunction(this, fnName, {
      ...commonFnProps,
      entry: `${__dirname}/../lambdas/auth/${fnEntry}`,
    });

    resource.addMethod(method, new apig.LambdaIntegration(fn));
  }
}
