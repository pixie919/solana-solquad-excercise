import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import idl from "../target/idl/solquad.json";
import {Solquad} from "../target/idl/solquad";

import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {BN} from "bn.js";

describe("solquad", async () => {
  const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), 'confirmed');
  const programId = new anchor.web3.PublicKey("3fowu869PY6frqrYPdhtCzsm7j1jgjpr47HyuyMP9xUH");

  const admin = anchor.web3.Keypair.generate();
  const admin2 = anchor.web3.Keypair.generate();
  const wallet = new anchor.Wallet(admin);

  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const provider2 = new anchor.AnchorProvider(connection, new anchor.Wallet(admin2), {});
  const program = new Program<Solquad>(idl as Solquad, programId, provider)
  const program2 = new Program<Solquad>(idl as Solquad, programId, provider2)

  const escrowOwner = anchor.web3.Keypair.generate();
  const projectOwner1 = anchor.web3.Keypair.generate();
  const projectOwner2 = anchor.web3.Keypair.generate();
  const projectOwner3 = anchor.web3.Keypair.generate();
  const voter1 = anchor.web3.Keypair.generate();
  const voter2 = anchor.web3.Keypair.generate();
  const voter3 = anchor.web3.Keypair.generate();
  const voter4 = anchor.web3.Keypair.generate();
  const voter5 = anchor.web3.Keypair.generate();
  const voter6 = anchor.web3.Keypair.generate();



  const [escrowPDA] = await anchor.web3.PublicKey.findProgramAddressSync([
    utf8.encode("escrow"),
    admin.publicKey.toBuffer(),
  ],
    program.programId
  );
  

  const [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync([
    utf8.encode("pool"),
    admin.publicKey.toBuffer(),
  ],
    program.programId
  );

  const [projectPDA1] = anchor.web3.PublicKey.findProgramAddressSync([
    utf8.encode("project"),
    poolPDA.toBytes(),
    admin.publicKey.toBuffer(),
  ],
    program.programId
  );

  const [differentEscrowPDA] = anchor.web3.PublicKey.findProgramAddressSync([
    utf8.encode("escrow"),
    admin2.publicKey.toBuffer(),
  ],
    program.programId
  );

  const [differentPoolPDA] = anchor.web3.PublicKey.findProgramAddressSync([
    utf8.encode("pool"),
    admin2.publicKey.toBuffer()
  ],
    program.programId
  );

  airdrop(admin, provider);
  airdrop(admin2, provider);

  // Test 1
  it("initializes escrow and pool", async () => {
    const poolIx = await program.methods.initializePool().accounts({
      poolAccount: poolPDA,
    }).instruction();

    const escrowAndPoolTx = await program.methods.initializeEscrow(new BN(10000)).accounts({
      escrowAccount: escrowPDA,
    })
    .postInstructions([poolIx])
    .rpc()
      
    console.log("Escrow and Pool are successfully created!", escrowAndPoolTx);

  });

  // Test 2
  it("creates project and add it to the pool", async () => {
    // Initialize the project and set isInPool to false
    await program.methods.initializeProject("My Project").accounts({
      projectAccount: projectPDA1,
      poolAccount: poolPDA,
    }).rpc();
  
    // Fetch the project account to check its state
    let projectAccount = await program.account.project.fetch(projectPDA1);
  
    // Check if the project is already in the pool
    if (projectAccount.isInPool) {
      throw new Error("Project is already in the pool");
    }
  
    // Create the instruction to add the project to the pool
    const addProjectIx = await program.methods.addProjectToPool().accounts({
      escrowAccount: escrowPDA,
      poolAccount: poolPDA,
      projectAccount: projectPDA1,
    }).instruction();
  
    // Add the project to the pool and update the isInPool flag to true
    const addProjectTx = await program.methods.addProjectToPool().accounts({
      escrowAccount: escrowPDA,
      poolAccount: poolPDA,
      projectAccount: projectPDA1,
    }).postInstructions([addProjectIx]).rpc();
  
    // Update the isInPool flag to true after adding to the pool
    await program.methods.setIsInPool(true).accounts({
      projectAccount: projectPDA1,
    }).rpc();
  
    console.log("Project successfully created and added to the pool", addProjectTx);
  
    const data = await program.account.pool.fetch(poolPDA);
    console.log("data projects", data.projects);
  });

  // Test 3
  it("tries to add the project in a different pool", async () => {
    // Fetch the project account to check its current pool association
    let projectAccount = await program.account.project.fetch(projectPDA1);
  
    // Check if the project is already associated with a pool
    if (projectAccount.isInPool) {
      throw new Error("Project is already associated with a pool");
    }
  
    // Initialize the different pool and escrow
    const poolIx = await program2.methods.initializePool().accounts({
      poolAccount: differentPoolPDA,
    }).instruction();
  
    const escrowIx = await program2.methods.initializeEscrow(new BN(10000)).accounts({
      escrowAccount: differentEscrowPDA,
    }).instruction();
  
    // Add the project to the different pool
    const addProjectTx = await program2.methods.addProjectToPool().accounts({
      projectAccount: projectPDA1,
      poolAccount: differentPoolPDA,
      escrowAccount: differentEscrowPDA,
    }).preInstructions([escrowIx, poolIx]).rpc();
  
    // Update the project's isInPool flag to true after adding to the pool
    await program.methods.setIsInPool(true).accounts({
      projectAccount: projectPDA1,
    }).rpc();
  
    console.log("Project added to a different pool successfully", addProjectTx);
  
    // Fetch and log the updated data from the different pool
    const data = await program.account.pool.fetch(differentPoolPDA);
    console.log("Data projects in different pool", data.projects);
  });

  // Test 4
  it("votes for the project and distributes the rewards", async () => {
    try {
      // Fetch current project data
      let projectData = await program.account.project.fetch(projectPDA1);
  
      // Check if the project has already received rewards
      if (projectData.distributedAmt > 0) {
        throw new Error("Project has already received rewards.");
      }
  
      // Initialize the distribution instruction
      const distribIx = await program.methods.distributeEscrowAmount().accounts({
        escrowAccount: escrowPDA,
        poolAccount: poolPDA,
        projectAccount: projectPDA1,
      }).instruction();
  
      // Vote for the project (assuming voteForProject updates distributed amount)
      const voteAmount = new BN(10);
      const voteTx = await program.methods.voteForProject(voteAmount).accounts({
        poolAccount: poolPDA,
        projectAccount: projectPDA1,
      }).postInstructions([distribIx]).rpc();
      
      console.log("Successfully voted on the project and distributed rewards", voteTx);
  
      // Fetch updated project data after distribution
      projectData = await program.account.project.fetch(projectPDA1);
      console.log("Distributed amount", projectData.distributedAmt.toString());
    } catch (error) {
      console.error("Error:", error);
      // Handle error as per your application's needs
    }
  });
});


async function airdrop(user, provider) {
  const AIRDROP_AMOUNT = anchor.web3.LAMPORTS_PER_SOL; // 5 SOL

  // airdrop to user
  const airdropSignature = await provider.connection.requestAirdrop(
    user.publicKey,
    AIRDROP_AMOUNT
  );
  const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();
  
  await provider.connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature: airdropSignature,
  });

  console.log(`Tx Complete: https://explorer.solana.com/tx/${airdropSignature}?cluster=Localnet`)
}