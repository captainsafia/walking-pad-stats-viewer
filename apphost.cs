#:package Aspire.Hosting.Azure.CognitiveServices@13.1.0-preview.1.25565.1
#pragma warning disable ASPIRECSHARPAPPS001
#:package Aspire.Hosting.Azure.Storage@13.1.0-preview.1.25565.1
#:package Aspire.Hosting.DevTunnels@13.1.0-preview.1.25565.1
#:sdk Aspire.AppHost.Sdk@13.1.0-preview.1.25565.1

using Azure.Provisioning.Storage;

var builder = DistributedApplication.CreateBuilder(args);

var storage = builder.AddAzureStorage("storage");
storage.ConfigureInfrastructure(infrastructure =>
    {
        var account = infrastructure.GetProvisionableResources().OfType<StorageAccount>().Single();
        // Allow blob access so model can access images, probably not secure but whatever
        account.AllowBlobPublicAccess = true;
    });
var blobContainer = storage.AddBlobs("walking-pad-captures");

var openai = builder.AddAzureOpenAI("walking-pad-stats");
var imageAnalysis = openai.AddDeployment(
    name: "image-analysis",
    modelName: "gpt-4o",
    modelVersion: "2024-11-20");

var app = builder.AddCSharpApp("api", "api.cs")
    .WithHttpEndpoint()
    .WithReference(blobContainer)
    .WithReference(imageAnalysis);

builder.AddDevTunnel("public-api")
       .WithReference(app)
       .WithAnonymousAccess();

builder.Build().Run();
