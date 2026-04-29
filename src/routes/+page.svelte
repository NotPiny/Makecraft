<script>
    import { Card } from "m3-svelte";

    import imageMRPack from '$lib/assets/mrpack.png';
</script>

<svelte:head>
    <title>Makecraft</title>
</svelte:head>

<div class="content">
    <Card variant="filled">
        <h1>Makecraft</h1>
        <p>
            Welcome to Makecraft, a collection of tools and resources for
            Minecraft modders and players. It aims to provide useful tools to
            get the job done. Not that many things are here yet, but more will
            be added in the future. If you have any suggestions, feel free to
            reach out to me on
            <a href="https://github.com/NotPiny" target="_blank">GitHub</a> or
            add an issue on the
            <a href="https://github.com/NotPiny/Makecraft" target="_blank"
                >GitHub repository</a
            >. Although there's probably not gonna be anything added that is
            already easily available elsewhere, as despite being a javascript
            developer, I don't want to reinvent the wheel.
        </p>
    </Card>
    <br />
    <Card variant="filled">
        <div class="row">
            <div class="details">
                <Card variant="outlined">
                    <h2>MRPack</h2>
                    <p>
                        Various tools for managing Modrinth modpacks. Currently
                        supports viewing modpack contents, comparing two
                        modpacks, and merging two modpacks together. More
                        features will be added in the future, such as modpack
                        creation and editing.
                    </p>
                </Card>
                <div class="features">
                    <Card variant="elevated">
                        <h3>View / Single</h3>
                        <p>
                            View the contents of a modpack.
                        </p>
                    </Card>
                    <Card variant="elevated">
                        <h3>Compare</h3>
                        <p>
                            Compare the contents of two modpacks.
                        </p>
                    </Card>
                    <Card variant="elevated">
                        <h3>Merge</h3>
                        <p>
                            Merge two modpacks together.
                        </p>
                    </Card>
                    <Card variant="elevated">
                        <h3>Convert</h3>
                        <p>
                            Convert to/from other modpack formats.
                        </p>
                    </Card>
                </div>
            </div>
            <div class="image">
                <Card variant="outlined">
                    <img
                        src={imageMRPack}
                        alt="MRPack screenshot"
                        width="100%"
                        height="auto"
                    />
                </Card>
            </div>
        </div>
    </Card>
</div>

<style>
    .content {
        margin: 1rem;
    }

    .row {
        display: flex;
        gap: 1rem;
        flex-direction: row;
        flex-wrap: wrap;

        width: 100%;
    }

    .details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .image {
        flex: 1;
    }

    .features {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
</style>
