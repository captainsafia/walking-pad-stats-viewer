#:sdk Microsoft.NET.Sdk.Web
#:package Aspire.Azure.Storage.Blobs@13.1.0-preview.1.25565.1
#:package Aspire.Azure.AI.OpenAI@13.1.0-preview.1.25565.1
#:package Microsoft.Extensions.AI@10.0.0
#:property PublishAoT=false
#:project ./servicedefaults

using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Add Aspire Azure Blob Storage client
builder.AddAzureBlobServiceClient("walking-pad-captures");

// Add Aspire Azure OpenAI client
builder.AddAzureOpenAIClient(connectionName: "image-analysis")
       .AddChatClient("image-analysis");

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Create API route group
var api = app.MapGroup("/api");

// GET /api/analyze - Analyze image with Azure AI Inference
api.MapGet("/analyze", async (string imageUrl, IChatClient chatClient, ILogger<Program> logger, CancellationToken cancellationToken) =>
{
    try
    {
        var messages = new List<ChatMessage>
        {
            new(ChatRole.User,
            [
                new TextContent("This is a walking pad LED display. Extract all the numbers shown. Return the numbers in a JSON format with the first number labelled as either time or calories, the second as speed, and the third as either distance or steps. Make sure numbers include colons and periods. Example: {\"time\": \"12:34\", \"speed\": \"5.6\", \"distance\": \"1.1\"} or {\"calories\": \"1234\", \"speed\": \"5.6\", \"steps\": \"2345\"}. Return only the JSON object, no additional text."),
                new UriContent(new Uri(imageUrl), "image/png")
            ])
        };
        
        var response = await chatClient.GetResponseAsync(messages, cancellationToken: cancellationToken);

        if (response.Messages is not null && response.Messages.Count == 1)
        {
            return Results.Content(response.Messages[0].Text, "application/json");
        }
        else
        {
            logger.LogWarning("Chat client returned empty response for image URL: {ImageUrl}", imageUrl);
            return Results.Problem("No response from AI model.");
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error analyzing image from URL: {ImageUrl}", imageUrl);
        return Results.Problem($"Error: {ex.Message}");
    }
});

// POST /api/upload - Upload image to Azure Storage
api.MapPost("/upload", async (Stream body, BlobServiceClient blobServiceClient) =>
{
    try
    {
        const string containerName = "walking-pad-captures";

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var date = DateTimeOffset.FromUnixTimeMilliseconds(timestamp);
        var filename = $"capture_{date:yyyyMMdd_HHmmss}.png";

        var containerClient = blobServiceClient.GetBlobContainerClient(containerName);
        await containerClient.CreateIfNotExistsAsync();
        var blobClient = containerClient.GetBlobClient(filename);

        await blobClient.UploadAsync(body, new BlobHttpHeaders { ContentType = "image/png" });
        return Results.Ok(new { filename, url = blobClient.Uri.ToString() });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Error: {ex.Message}");
    }
});

app.Run();
