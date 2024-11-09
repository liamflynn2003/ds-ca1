#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DistSystemsCa1Stack } from '../lib/dist-systems-ca1-stack';

const app = new cdk.App();
new DistSystemsCa1Stack(app, 'DistSystemsCa1Stack', {
  env: { region: "eu-west-1" }
});