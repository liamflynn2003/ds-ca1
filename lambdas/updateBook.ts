import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", JSON.stringify(event));

    const { id } = event.pathParameters || {};
    if (!id) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Book ID is required" }),
      };
    }

    // Parse and destructure volumeInfo data from the event body
    const { volumeInfo } = JSON.parse(event.body || '{}');
    if (!volumeInfo) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "volumeInfo is required in the request body" }),
      };
    }

    const { title, author, publishedDate, description, categories } = volumeInfo;

    // Construct the update expression for the nested volumeInfo attributes
    const updateExpression = `
      SET volumeInfo.title = :title, 
          volumeInfo.author = :author, 
          volumeInfo.publishedDate = :publishedDate, 
          volumeInfo.description = :description, 
          volumeInfo.categories = :categories
    `;

    const expressionAttributeValues = {
      ":title": title,
      ":author": author,
      ":publishedDate": publishedDate,
      ":description": description,
      ":categories": categories,
    };

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Book updated successfully" }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Failed to update book" }),
    };
  }
};

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
