function result = pulse_v2_pipeline(folder, model, clusterCount, allowTestData, mobilityTarget)
% Load Python-prepared complete-case feature tables and optionally test clustering.
% Requires MATLAB R2020b+; clustering additionally requires Statistics Toolbox.
% This is engineering scaffolding, not validated behavioural-twin archetypes.
arguments
    folder (1,1) string
    model (1,1) string {mustBeMember(model,["mobility","wpt","v2g"])}
    clusterCount (1,1) double {mustBeInteger,mustBeNonnegative} = 0
    allowTestData (1,1) logical = false
    mobilityTarget (1,1) string = ""
end
filename = fullfile(folder,"model_input_" + model + ".csv");
T = readtable(filename,"TextType","string","VariableNamingRule","preserve");
if height(T) == 0
    result = struct("records",0,"model",model,"modelsFitted",false);
    return
end
if ~allowTestData && any(T.record_kind ~= "study_response")
    error("PULSE:TestData","Test or synthetic records require explicit allowTestData=true.");
end
if model == "mobility"
    if strlength(mobilityTarget) == 0
        error("PULSE:Referent","Choose a mobilityTarget; do not pool current, maintenance and conditional intentions automatically.");
    end
    T = T(T.comb_target == mobilityTarget,:);
end
metadata = ["session_id","record_kind","test_purpose","complete","instrument_version","site",...
    "technology","respondent_route","comb_target","active_ms"];
names = string(T.Properties.VariableNames);
features = names(~ismember(names,metadata));
X = T{:,cellstr(features)};
if ~isnumeric(X) || any(~isfinite(X),"all")
    error("PULSE:Features","Use complete numeric candidate-score features only.");
end
result = struct("records",height(T),"model",model,"features",features,...
    "modelsFitted",false,"source",filename,"populationWeights",[]);
if clusterCount == 0
    result.table = T;
    return
end
if clusterCount < 2 || height(T) <= clusterCount
    error("PULSE:ClusterCount","Clustering requires at least two clusters and more records than clusters.");
end
mu = mean(X,1); sigma = std(X,0,1); keep = sigma > 0;
if ~any(keep)
    error("PULSE:NoVariance","The selected features have no variance.");
end
Z = (X(:,keep)-mu(keep))./sigma(keep);
rng(2026,"twister");
[labels,centres] = kmeans(Z,clusterCount,"Replicates",20,"MaxIter",500);
assignments = T(:,cellstr(metadata));
assignments.test_cluster = labels;
result.modelsFitted = true;
result.assignments = assignments;
result.centresStandardised = centres;
result.featureMeans = mu;
result.featureSD = sigma;
result.usedFeatures = features(keep);
result.interpretation = "Exploratory software test; measurement and archetype validity require independent assessment.";
writetable(assignments,fullfile(folder,"test_clusters_" + model + ".csv"));
end
