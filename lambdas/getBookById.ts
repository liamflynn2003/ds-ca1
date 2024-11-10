import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: Handler = async (event) => {
  try {
    // Print Event
    console.log("[EVENT]", JSON.stringify(event));

    const parameters = event?.pathParameters;
    const queryParams = event.queryStringParameters;
    const id = parameters?.id;

    if (!id) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ Message: "Missing book id" }),
      };
    }

    // Fetch book details by id
    const commandOutput = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id: id },
      })
    );

    console.log("GetCommand response: ", commandOutput);

    if (!commandOutput.Item) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ Message: "Invalid book id" }),
      };
    }

    const volumeInfo = commandOutput.Item?.volumeInfo;

    // If no query is made, return volumeInfo
    if (!queryParams?.authors && !queryParams?.title && !queryParams?.categories) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: volumeInfo || {} }),
      };
    }

    // Handle query for authors
    if (queryParams?.authors === 'true') {
      const authorsCommandOutput = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id },
        })
      );
      const authors = authorsCommandOutput.Items?.map(item => item?.volumeInfo?.authors).flat() || [];

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: authors }),
      };
    }

    // Handle query for categories
    if (queryParams?.categories === 'true') {
      const categoriesCommandOutput = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id },
        })
      );
      const categories = categoriesCommandOutput.Items?.map(item => item?.volumeInfo?.categories).flat() || [];

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: categories }),
      }
    }

    // Handle query for title
    if (queryParams?.title === 'true') {
      const titleCommandOutput = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id },
        })
      );
      const title = titleCommandOutput.Items?.map(item => item?.volumeInfo?.title).flat() || [];

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: title }),
      };
    }

    // Default return if no specific query is made
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: volumeInfo || {} }),
    };
  } catch (error: any) {
    console.log("Error: ", JSON.stringify(error));
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};

// Function to create a DynamoDB Document Client with marshall/unmarshall options
function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
