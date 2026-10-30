package com.example.cpen321application.data

data class Profile(val id: String, val name: String, val email: String, val pronouns: String)

interface ProfileRepository {
    suspend fun getProfile(): Profile

    suspend fun updatePronouns(pronouns: String): Profile
}
