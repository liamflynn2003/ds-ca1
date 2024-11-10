import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ddbDocClient = createDDbDocClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: Handler = async (event) => {
  try {
    console.log("[EVENT]", JSON.stringify(event));

    const parameters = event?.pathParameters;
    const queryParams = event.queryStringParameters;
    const id = parameters?.id;
    const language = queryParams?.language;

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
      const translatedVolumeInfo = language ? await translateText(volumeInfo, language) : volumeInfo;
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: translatedVolumeInfo || {} }),
      };
    }

    // Handle query for authors, categories, and title
    const handleQuery = async (key: string) => {
      const queryCommandOutput = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id },
        })
      );
      const data = queryCommandOutput.Items?.map(item => item?.volumeInfo?.[key]).flat() || [];
      return language ? await translateText({ [key]: data }, language) : data;
    };

    if (queryParams?.authors === 'true') {
      const authors = await handleQuery("authors");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: authors }),
      };
    }

    if (queryParams?.categories === 'true') {
      const categories = await handleQuery("categories");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: categories }),
      };
    }

    if (queryParams?.title === 'true') {
      const title = await handleQuery("title");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: title }),
      };
    }

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

async function translateText(data, targetLanguage) {
  // Helper function to check if data is a string and translate it
  function translateIfString(value) {
    if (typeof value === 'string') {
      return translateClient.send(new TranslateTextCommand({
        Text: value,
        SourceLanguageCode: 'en',
        TargetLanguageCode: targetLanguage,
      }))
        .then(result => result.TranslatedText)
        .catch(err => {
          console.error('Translation Error: ', err);
          return value; 
        });
    }
    return Promise.resolve(value); 
  }

  // If the input is an object, iterate through its properties
  if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
    const translatedData = {};

    for (const [key, value] of Object.entries(data)) {
      translatedData[key] = await translateIfString(value);
    }
    return translatedData;
  } else if (Array.isArray(data)) {
    return Promise.all(data.map(item => translateIfString(item)));
  } else {
    return translateIfString(data);
  }
}


